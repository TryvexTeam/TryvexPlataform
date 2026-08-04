import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'

/**
 * Sirve un adjunto del chat.
 *
 * El bucket es privado: acá viajan archivos internos del equipo. En vez de
 * guardar URLs firmadas en el mensaje —que vencen a mitad de la conversación y
 * quedan en el historial para siempre— la URL apunta a este endpoint, que
 * comprueba la pertenencia en CADA pedido y recién ahí firma una de vida corta.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adjunto } = await (supabase as any)
    .from('mensaje_adjuntos')
    .select('ruta, mensajes(conversacion_id)')
    .eq('id', id)
    .maybeSingle()

  if (!adjunto) return NextResponse.json({ success: false, error: 'No existe' }, { status: 404 })

  const conversacionId = adjunto.mensajes?.conversacion_id as string | undefined
  if (!conversacionId) return NextResponse.json({ success: false, error: 'No existe' }, { status: 404 })

  // La policy de la 024 ya filtra por pertenencia, pero se comprueba explícito:
  // el día que alguien lea esto con service role, el permiso sigue estando acá.
  if (!(await new ChatRepository(supabase).esMiembro(conversacionId, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esa conversación' }, { status: 403 })
  }

  const { data: firmada, error } = await createAdminClient()
    .storage.from('adjuntos-chat')
    .createSignedUrl(adjunto.ruta as string, 60)

  if (error || !firmada) {
    return NextResponse.json({ success: false, error: 'No se pudo abrir el archivo' }, { status: 500 })
  }

  return NextResponse.redirect(firmada.signedUrl)
}
