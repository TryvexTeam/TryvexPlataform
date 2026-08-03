import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { EnviarMensajeSchema } from '@/lib/types/chat'

/** Mensajes de una conversación: ?conversacion=<uuid> */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const conversacionId = new URL(req.url).searchParams.get('conversacion')
  if (!conversacionId) return NextResponse.json({ success: false, error: 'Falta la conversación' }, { status: 400 })

  const repo = new ChatRepository(supabase)
  if (!(await repo.esMiembro(conversacionId, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esa conversación' }, { status: 403 })
  }

  const mensajes = await repo.listMensajes(conversacionId)
  await repo.marcarLeida(conversacionId, perfil.id)
  return NextResponse.json({ success: true, data: mensajes })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = EnviarMensajeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Mensaje inválido' },
      { status: 400 },
    )
  }

  const { conversacion_id, contenido } = parsed.data
  const repo = new ChatRepository(supabase)

  try {
    const mensaje = await repo.enviar(conversacion_id, perfil.id, contenido)

    // Aviso al resto: push al celular si lo tienen activado. Best-effort.
    const conversaciones = await repo.listConversaciones(perfil.id)
    const conv = conversaciones.find((c) => c.id === conversacion_id)
    const destinatarios = (conv?.miembros ?? [])
      .map((m) => m.integrante_id)
      .filter((id) => id !== perfil.id)

    if (destinatarios.length > 0) {
      const titulo = conv?.tipo === 'grupo' ? `${perfil.nombre} en ${conv.nombre}` : perfil.nombre
      const { enviarPush } = await import('@/lib/push/server')
      await enviarPush(destinatarios, {
        titulo,
        cuerpo: contenido.slice(0, 140),
        link: `/chat?c=${conversacion_id}`,
        tag: `chat-${conversacion_id}`,
      })
    }

    return NextResponse.json({ success: true, data: mensaje })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error enviando el mensaje' },
      { status: 500 },
    )
  }
}
