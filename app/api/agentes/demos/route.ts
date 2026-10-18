import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'

/**
 * Demos de agente, vistas desde el bot de WhatsApp.
 *
 *   GET  /api/agentes/demos?telefono=56912345678
 *        → la demo activa y vigente para ese número, o { demo: null }
 *   POST /api/agentes/demos   { "id": "<uuid>" }
 *        → gasta una respuesta; { quedan: N } o 409 si ya no puede responder
 *
 * Cuando un número tiene una demo activa, el bot deja de hablar como vendedor
 * de Tryvex y responde como el asistente del negocio de la demo, con el guion
 * que armó el equipo en Intelligence.
 *
 * El gasto va en una sola sentencia en la base (`consumir_mensaje_demo`): leer
 * el contador y después escribirlo dejaría pasar dos respuestas simultáneas con
 * el último cupo.
 */

const TelefonoSchema = z.string().regex(/^\d{8,15}$/, 'El teléfono va solo con dígitos y código de país.')

export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error

  const telefono = TelefonoSchema.safeParse(new URL(req.url).searchParams.get('telefono') ?? '')
  if (!telefono.success) return datosInvalidos(telefono.error.issues[0]?.message ?? 'Teléfono inválido.')

  const { data, error } = await auth.admin
    .from('demos_agente')
    .select('id, nombre_negocio, guion, vence_at, limite_mensajes, mensajes_usados, created_at')
    .eq('telefono', telefono.data)
    .eq('activa', true)
    .gt('vence_at', new Date().toISOString())
    .maybeSingle()

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo consultar la demo' }, { status: 500 })
  }

  type Fila = {
    id: string
    nombre_negocio: string
    guion: string
    vence_at: string
    limite_mensajes: number
    mensajes_usados: number
    created_at: string
  }
  const fila = data as Fila | null

  // Sin cupo cuenta como sin demo: el bot vuelve a atender como siempre.
  if (!fila || fila.mensajes_usados >= fila.limite_mensajes) {
    return NextResponse.json({ success: true, demo: null })
  }

  return NextResponse.json({
    success: true,
    demo: {
      id: fila.id,
      nombreNegocio: fila.nombre_negocio,
      guion: fila.guion,
      venceAt: fila.vence_at,
      quedan: fila.limite_mensajes - fila.mensajes_usados,
      // Desde cuándo vale: el bot ignora el historial anterior, para que la
      // demo no arrastre la conversación de ventas que hubo antes con ese número.
      desde: fila.created_at,
    },
  })
}

const ConsumirSchema = z.object({ id: z.string().uuid() })

export async function POST(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error

  const datos = ConsumirSchema.safeParse(leido.cuerpo)
  if (!datos.success) return datosInvalidos('Falta el id de la demo.')

  const { data, error } = await auth.admin.rpc('consumir_mensaje_demo', { p_id: datos.data.id })
  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo registrar el uso de la demo' }, { status: 500 })
  }

  const quedan = typeof data === 'number' ? data : -1
  if (quedan < 0) {
    return NextResponse.json(
      { success: false, error: 'La demo ya no puede responder: está apagada, vencida o sin cupo.' },
      { status: 409 },
    )
  }
  return NextResponse.json({ success: true, quedan })
}
