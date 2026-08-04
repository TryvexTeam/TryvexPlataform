import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'

/**
 * Elimina un mensaje.
 *
 * Es borrado suave: se marca `eliminado_at` y se vacía el texto. Borrar la fila
 * dejaría huérfana a la respuesta que lo citaba y haría desaparecer un tramo de
 * conversación sin dejar rastro — un mensaje tachado se entiende, un hueco no.
 *
 * Lo puede hacer quien lo escribió, y el admin cualquiera: si algo no debe estar
 * en el chat del equipo, alguien tiene que poder sacarlo.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mensaje } = await (supabase as any)
    .from('mensajes')
    .select('autor_id, conversacion_id')
    .eq('id', id)
    .maybeSingle()

  if (!mensaje) return NextResponse.json({ success: false, error: 'No existe' }, { status: 404 })

  const esMio = mensaje.autor_id === perfil.id
  if (!esMio && !perfil.es_admin) {
    return NextResponse.json(
      { success: false, error: 'Solo puedes eliminar tus propios mensajes' },
      { status: 403 },
    )
  }

  // La policy de la 026 ya cubre esto, pero se comprueba también acá: el día que
  // alguien llame esta ruta con service role, el permiso sigue estando.
  try {
    await new ChatRepository(supabase).eliminar(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'No se pudo eliminar' },
      { status: 500 },
    )
  }
}
