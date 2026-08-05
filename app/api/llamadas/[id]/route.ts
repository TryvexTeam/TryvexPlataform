import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { LlamadasRepository } from '@/lib/repos/llamadas'
import { AccionLlamadaSchema } from '@/lib/types/llamada'

export const dynamic = 'force-dynamic'

/**
 * Entrar, rechazar, salir o terminar. Las cuatro son idempotentes: la red se
 * corta a mitad y el cliente reintenta, y salir dos veces tiene que dar lo mismo
 * que salir una.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = AccionLlamadaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Acción inválida' }, { status: 400 })

  try {
    const llamadas = new LlamadasRepository(supabase)
    const llamada = await llamadas.porId(id)
    if (!llamada) return NextResponse.json({ success: false, error: 'La llamada no existe' }, { status: 404 })

    // El permiso es sobre la conversación, no sobre la llamada: quien está en el
    // hilo puede entrar. Comprobarlo acá y no confiar en la RLS sola deja el 403
    // con un mensaje entendible en vez de una fila vacía.
    const chat = new ChatRepository(supabase)
    if (!(await chat.esMiembro(llamada.conversacion_id, perfil.id))) {
      return NextResponse.json({ success: false, error: 'No perteneces a esta conversación' }, { status: 403 })
    }

    switch (parsed.data.accion) {
      case 'entrar':
        if (llamada.estado === 'terminada') {
          return NextResponse.json({ success: false, error: 'La llamada ya terminó' }, { status: 409 })
        }
        await llamadas.entrar(id, perfil.id)
        break
      case 'rechazar':
        await llamadas.rechazar(id, perfil.id)
        break
      case 'salir':
        await llamadas.salir(id, perfil.id)
        break
      case 'terminar':
        await llamadas.terminar(id, 'colgada')
        break
    }

    const actualizada = await llamadas.porId(id)
    const participantes = await llamadas.participantes(id)
    return NextResponse.json({ success: true, data: { llamada: actualizada, participantes } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error en la llamada' },
      { status: 500 },
    )
  }
}
