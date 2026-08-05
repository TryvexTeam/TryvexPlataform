import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { LlamadasRepository } from '@/lib/repos/llamadas'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import { IniciarLlamadaSchema } from '@/lib/types/llamada'
import { tituloConversacion } from '@/lib/types/chat'

export const dynamic = 'force-dynamic'

/** ¿Hay una llamada en curso en este hilo? Lo consulta el chat al abrirse. */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const conversacionId = new URL(req.url).searchParams.get('conversacion')
  if (!conversacionId) return NextResponse.json({ success: false, error: 'Falta conversacion' }, { status: 400 })

  const chat = new ChatRepository(supabase)
  if (!(await chat.esMiembro(conversacionId, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esta conversación' }, { status: 403 })
  }

  try {
    const llamadas = new LlamadasRepository(supabase)
    const llamada = await llamadas.viva(conversacionId)
    const participantes = llamada ? await llamadas.participantes(llamada.id) : []
    return NextResponse.json({ success: true, data: { llamada, participantes } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error consultando la llamada' },
      { status: 500 },
    )
  }
}

/** Llamar. Si ya hay una sonando o en curso en este hilo, se une a esa. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = IniciarLlamadaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 })
  }

  const { conversacion_id, con_video } = parsed.data
  const chat = new ChatRepository(supabase)

  if (!(await chat.esMiembro(conversacion_id, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esta conversación' }, { status: 403 })
  }

  try {
    const miembros = await chat.miembrosDe(conversacion_id)
    const llamadas = new LlamadasRepository(supabase)
    const { llamada, yaExistia } = await llamadas.iniciar({
      conversacionId: conversacion_id,
      iniciadaPor: perfil.id,
      conVideo: con_video,
      miembros,
    })

    // El timbre. Solo al abrirla: si alguien se suma a una llamada que ya está en
    // curso, volver a notificar a todos sería avisar dos veces de lo mismo.
    if (!yaExistia) {
      const conversaciones = await chat.listConversaciones(perfil.id)
      const conv = conversaciones.find((c) => c.id === conversacion_id)
      const donde = conv ? tituloConversacion(conv, perfil.id) : 'el chat'

      await new NotificacionesRepository(supabase).notificar({
        destinatarios: miembros,
        excluir: perfil.id,
        tipo: 'llamada_entrante',
        titulo: `${perfil.nombre} te está llamando`,
        cuerpo: con_video ? `Videollamada en ${donde}` : `Llamada de voz en ${donde}`,
        link: `/chat?c=${conversacion_id}&llamada=${llamada.id}`,
      })
    }

    const participantes = await llamadas.participantes(llamada.id)
    return NextResponse.json({ success: true, data: { llamada, participantes, yaExistia } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'No se pudo iniciar la llamada' },
      { status: 500 },
    )
  }
}
