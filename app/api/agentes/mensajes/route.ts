import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera } from '@/lib/agentes/token'
import {
  LoteMensajesAgenteSchema,
  MensajeAgenteSchema,
  type MensajeAgenteInput,
} from '@/lib/types/agente'

/**
 * La puerta del canal de agentes.
 *
 * Acá entran Jarvis, Ariel y Spike, que corren como servicios sin navegador.
 * Se autentican con `Authorization: Bearer <token>` y escriben en el hilo
 * "Equipo agéntico" del CRM — el destino de la migración de #chatia.
 *
 * Usa service role a propósito: no hay sesión de Supabase que representar. El
 * permiso lo da el token, y el alcance está acotado a mano — un agente solo
 * puede leer y escribir en conversaciones de tipo 'agentes', nunca en los DM
 * del equipo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

const HILO_POR_DEFECTO = 'Equipo agéntico'

interface Agente {
  id: string
  nombre: string
  color: string | null
  avatar_url: string | null
  token_hash: string
}

/** Devuelve el agente del token, o null. Nunca dice cuál de las dos cosas falló. */
async function autenticar(req: Request): Promise<Agente | null> {
  const token = tokenDeCabecera(req)
  if (!token) return null

  const admin = createAdminClient() as SB
  const { data } = await admin.from('agentes').select('*').eq('activo', true)

  // Se recorren todos y se compara el hash: buscar por hash directo sería más
  // rápido, pero entonces la consulta misma revelaría si el token existe.
  const agente = ((data ?? []) as Agente[]).find((a) => tokenCoincide(token, a.token_hash))
  if (!agente) return null

  await admin.from('agentes').update({ ultimo_uso_at: new Date().toISOString() }).eq('id', agente.id)
  return agente
}

/** El hilo de agentes al que se escribe. Solo de tipo 'agentes': nunca un DM. */
async function hiloDeAgentes(admin: SB, nombre?: string): Promise<string | null> {
  const { data } = await admin
    .from('conversaciones')
    .select('id')
    .eq('tipo', 'agentes')
    .eq('nombre', nombre ?? HILO_POR_DEFECTO)
    .maybeSingle()
  return (data?.id as string) ?? null
}

/** Lo último del canal, para que un agente que despierta sepa qué se habló. */
export async function GET(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const admin = createAdminClient() as SB
  const hilo = await hiloDeAgentes(admin, new URL(req.url).searchParams.get('hilo') ?? undefined)
  if (!hilo) return NextResponse.json({ success: false, error: 'No existe ese canal' }, { status: 404 })

  const limite = Math.min(Number(new URL(req.url).searchParams.get('limite') ?? 50) || 50, 200)

  const { data, error } = await admin
    .from('mensajes')
    .select('id, contenido, created_at, autor_id, agente_id')
    .eq('conversacion_id', hilo)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // Se piden los más nuevos; se devuelven en orden de lectura.
  return NextResponse.json({ success: true, data: (data ?? []).reverse() })
}

/**
 * Cuáles de esos `origen_ref` ya están en la base.
 *
 * La idempotencia real la garantiza el índice único de la 031; esto es solo para
 * poder informar cuántos se saltaron y no gastar un insert que va a rebotar.
 */
async function refsYaIngestados(admin: SB, refs: string[]): Promise<Set<string>> {
  if (refs.length === 0) return new Set()
  const { data, error } = await admin.from('mensajes').select('origen_ref').in('origen_ref', refs)
  if (error) throw new Error(error.message)
  return new Set((data ?? []).map((r: { origen_ref: string }) => r.origen_ref))
}

export async function POST(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo) return NextResponse.json({ success: false, error: 'Cuerpo inválido' }, { status: 400 })

  // Dos formas de llamar, un solo camino interno:
  //   { contenido, hilo? }            → un mensaje (la forma original, se conserva)
  //   { mensajes: [...], hilo? }      → un lote (migrar #chatia sin mil requests)
  const lote = LoteMensajesAgenteSchema.safeParse(cuerpo)
  const uno = lote.success ? null : MensajeAgenteSchema.safeParse(cuerpo)

  if (!lote.success && !uno!.success) {
    // Se reporta el error de la forma que el cuerpo intentó ser, no el de las dos.
    const esLote = typeof cuerpo === 'object' && cuerpo !== null && 'mensajes' in cuerpo
    const detalle = esLote ? lote.error.issues : uno!.error.issues
    return NextResponse.json({ success: false, error: detalle }, { status: 400 })
  }

  const mensajes: MensajeAgenteInput[] = lote.success ? lote.data.mensajes : [uno!.data!]
  const nombreHilo = (lote.success ? lote.data.hilo : uno!.data!.hilo) ?? undefined

  const admin = createAdminClient() as SB
  const hilo = await hiloDeAgentes(admin, nombreHilo)
  if (!hilo) return NextResponse.json({ success: false, error: 'No existe ese canal' }, { status: 404 })

  let yaEstan: Set<string>
  try {
    yaEstan = await refsYaIngestados(
      admin,
      mensajes.map((m) => m.origen_ref).filter((r): r is string => Boolean(r)),
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error consultando duplicados'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }

  const nuevos = mensajes.filter((m) => !m.origen_ref || !yaEstan.has(m.origen_ref))
  const duplicados = mensajes.length - nuevos.length

  if (nuevos.length === 0) {
    return NextResponse.json({ success: true, data: { insertados: 0, duplicados, ids: [] } })
  }

  const filas = nuevos.map((m) => ({
    conversacion_id: hilo,
    // autor_id va nulo: el constraint de la 024 exige exactamente uno de los dos.
    agente_id: agente.id,
    contenido: m.contenido,
    origen_ref: m.origen_ref ?? null,
    // Solo se fuerza la fecha si vino: para un mensaje en vivo manda el DEFAULT.
    ...(m.created_at ? { created_at: m.created_at } : {}),
  }))

  const { data, error } = await admin
    .from('mensajes')
    .insert(filas)
    .select('id, contenido, created_at, agente_id, origen_ref')

  if (error) {
    // 23505 = el índice único frenó una carrera entre dos ingestas simultáneas.
    // Es el mecanismo funcionando, no una falla: se informa como duplicado.
    if (error.code === '23505') {
      return NextResponse.json({
        success: true,
        data: { insertados: 0, duplicados: mensajes.length, ids: [] },
      })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const insertados = data ?? []

  // Un mensaje suelto sigue devolviendo el mensaje, como antes de existir el lote.
  if (!lote.success) {
    return NextResponse.json({ success: true, data: insertados[0] ?? null })
  }

  return NextResponse.json({
    success: true,
    data: {
      insertados: insertados.length,
      duplicados,
      ids: insertados.map((m: { id: string }) => m.id),
    },
  })
}
