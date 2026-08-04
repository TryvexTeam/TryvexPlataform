import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera } from '@/lib/agentes/token'

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

export async function POST(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const cuerpo = (await req.json().catch(() => null)) as { contenido?: string; hilo?: string } | null
  const contenido = cuerpo?.contenido?.trim()
  if (!contenido) {
    return NextResponse.json({ success: false, error: 'Falta el contenido' }, { status: 400 })
  }
  if (contenido.length > 8000) {
    return NextResponse.json({ success: false, error: 'Máximo 8000 caracteres' }, { status: 400 })
  }

  const admin = createAdminClient() as SB
  const hilo = await hiloDeAgentes(admin, cuerpo?.hilo)
  if (!hilo) return NextResponse.json({ success: false, error: 'No existe ese canal' }, { status: 404 })

  const { data, error } = await admin
    .from('mensajes')
    // autor_id va nulo: el constraint de la 024 exige exactamente uno de los dos.
    .insert({ conversacion_id: hilo, agente_id: agente.id, contenido })
    .select('id, contenido, created_at, agente_id')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, data })
}
