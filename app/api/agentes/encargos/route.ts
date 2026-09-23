import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'

/**
 * La cola de encargos, vista desde el agente.
 *
 * Es la mitad que faltaba: el equipo ya podía encolarle trabajo a un agente y
 * aprobarlo desde Intelligence, pero ningún agente lo leía. Con esto Jarvis,
 * Ariel, Spike y los demás consultan lo que tienen permitido hacer y dejan su
 * respuesta donde el equipo la ve.
 *
 * La regla que no se negocia: **lo que está `encolado` no se puede tocar desde
 * acá.** Un encargo esperando permiso es trabajo que ninguna persona autorizó
 * todavía. El agente puede verlo (para saber qué viene), pero ni tomarlo ni
 * responderlo. Solo lo `aprobado` pasa por esta puerta.
 *
 *   GET   /api/agentes/encargos            → lo aprobado y en curso (mi trabajo)
 *   GET   /api/agentes/encargos?todos=1    → + lo que espera permiso (solo lectura)
 *   PATCH /api/agentes/encargos            → tomar o responder uno
 */

const COLUMNAS =
  'id, tipo, titulo, detalle, estado, prioridad, aprobado_at, respuesta, created_at'

export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const incluirEsperando = new URL(req.url).searchParams.get('todos') === '1'
  const estados = incluirEsperando
    ? ['encolado', 'aprobado', 'en_curso']
    : ['aprobado', 'en_curso']

  const { data, error } = await admin
    .from('agente_encargos')
    .select(COLUMNAS)
    // El alcance se acota a mano: service role ve todo, el agente solo lo suyo.
    .eq('agente_id', agente.id)
    .in('estado', estados)
    .is('archivado_at', null)
    // Lo urgente primero; a igual prioridad, lo más antiguo primero (FIFO).
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo leer la cola' }, { status: 500 })
  }

  const peso = { alta: 0, media: 1, baja: 2 } as const
  const encargos = ((data ?? []) as Array<{ prioridad: keyof typeof peso }>).sort(
    (a, b) => peso[a.prioridad] - peso[b.prioridad],
  )

  return NextResponse.json({
    success: true,
    agente: agente.nombre,
    encargos,
    // Recordatorio explícito para quien programe el agente: lo encolado se ve,
    // no se trabaja. Evita que alguien "optimice" saltándose el permiso.
    nota: incluirEsperando
      ? 'Los encargos en estado "encolado" esperan permiso humano: no los ejecute.'
      : undefined,
  })
}

const AccionSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('tomar'),
    id: z.string().uuid(),
  }),
  z.object({
    accion: z.literal('responder'),
    id: z.string().uuid(),
    respuesta: z
      .string()
      .trim()
      .min(1, 'La respuesta no puede ir vacía: un "listo" sin contenido no se puede revisar.')
      .max(8000),
  }),
])

export async function PATCH(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error
  const cuerpo = leido.cuerpo

  const datos = AccionSchema.safeParse(cuerpo)
  if (!datos.success) {
    return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')
  }

  const ahora = new Date().toISOString()

  // Cada transición declara de qué estado puede partir. Por eso `encolado` no
  // aparece en ninguna: un encargo sin permiso no avanza por esta puerta.
  const transicion =
    datos.data.accion === 'tomar'
      ? { desde: ['aprobado'], cambios: { estado: 'en_curso' } }
      : {
          desde: ['aprobado', 'en_curso'],
          cambios: { estado: 'respondido', respuesta: datos.data.respuesta, respondido_at: ahora },
        }

  const { data, error } = await admin
    .from('agente_encargos')
    .update(transicion.cambios)
    .eq('id', datos.data.id)
    .eq('agente_id', agente.id)
    .in('estado', transicion.desde)
    .is('archivado_at', null)
    .select('id, estado')

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo actualizar' }, { status: 500 })
  }

  // Cero filas: o el encargo no es suyo, o no tiene permiso, o ya se respondió.
  // Se explica en vez de devolver un 200 mudo: un agente que cree haber
  // respondido y no lo hizo es peor que uno que recibe un error claro.
  if (!data || data.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No se pudo aplicar: el encargo no existe, no es suyo, o no tiene permiso todavía (solo se trabaja lo aprobado).',
      },
      { status: 409 },
    )
  }

  return NextResponse.json({ success: true, encargo: data[0] })
}
