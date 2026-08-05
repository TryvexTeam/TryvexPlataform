import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { ReaccionSchema } from '@/lib/types/chat'

/**
 * Poner o sacar un emoji de un mensaje.
 *
 * Un solo POST hace las dos cosas: si ya reaccionaste con ese emoji, lo saca. No hay
 * DELETE porque desde la UI es el mismo clic sobre la misma píldora, y dos endpoints
 * obligarían al cliente a saber de antemano en qué estado está — que es justo lo que
 * se desincroniza cuando dos personas reaccionan a la vez.
 *
 * Que seas miembro de la conversación lo verifica RLS (migración 032): la policy salta
 * de mensaje_id a conversacion_id en la base. Si dependiera de lo que manda el front,
 * se podría reaccionar en un DM ajeno conociendo el id del mensaje.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const parsed = ReaccionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Emoji inválido' }, { status: 400 })
  }

  try {
    const repo = new ChatRepository(supabase)
    const { puesta } = await repo.alternarReaccion(id, perfil.id, parsed.data.emoji)
    return NextResponse.json({ success: true, data: { emoji: parsed.data.emoji, puesta } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo reaccionar'

    // La policy rebota con 42501 cuando el mensaje es de una conversación ajena.
    // Se responde 403 y no 500: no es un fallo del servidor, es un permiso.
    const sinPermiso = msg.includes('42501') || msg.toLowerCase().includes('policy')
    return NextResponse.json(
      { success: false, error: sinPermiso ? 'No perteneces a esa conversación' : msg },
      { status: sinPermiso ? 403 : 500 },
    )
  }
}
