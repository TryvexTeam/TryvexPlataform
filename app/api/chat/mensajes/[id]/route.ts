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
/**
 * Fija o suelta un mensaje: `{ "fijar": true | false }`.
 *
 * A diferencia de eliminar, esto NO es del autor: fijar es un acto sobre la
 * conversación, así que cualquier miembro puede fijar el mensaje de otro — como en
 * Slack, donde lo importante lo marca quien lo necesita, no quien lo escribió.
 * Quién es miembro lo decide el trigger de la 032, no este handler.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const cuerpo = (await req.json().catch(() => null)) as { fijar?: boolean } | null
  if (typeof cuerpo?.fijar !== 'boolean') {
    return NextResponse.json({ success: false, error: 'Falta "fijar" (true o false)' }, { status: 400 })
  }

  try {
    await new ChatRepository(supabase).fijar(id, cuerpo.fijar)
    return NextResponse.json({ success: true, data: { fijado: cuerpo.fijar } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo fijar'
    const sinPermiso = msg.includes('solo_miembros_fijan') || msg.includes('42501')
    return NextResponse.json(
      { success: false, error: sinPermiso ? 'No perteneces a esa conversación' : msg },
      { status: sinPermiso ? 403 : 500 },
    )
  }
}

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
    const repo = new ChatRepository(supabase)

    // Las rutas se piden ANTES de borrar: al irse la fila, el CASCADE se lleva
    // las de `mensaje_adjuntos` y ya no hay forma de saber qué archivos quedaron
    // colgados en el bucket. Nadie los vería, pero seguirían ocupando espacio.
    const rutas = await repo.rutasAdjuntosDe(id)

    await repo.eliminar(id)

    if (rutas.length > 0) {
      const { createAdminClient } = await import('@/lib/supabase/server')
      await createAdminClient().storage.from('adjuntos-chat').remove(rutas)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'No se pudo eliminar' },
      { status: 500 },
    )
  }
}
