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
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adjunto } = await (supabase as any)
    .from('mensaje_adjuntos')
    .select('ruta, nombre, tipo_mime, bytes, mensajes(conversacion_id)')
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

  const almacen = createAdminClient().storage.from('adjuntos-chat')
  const ruta = adjunto.ruta as string
  const nombre = (adjunto.nombre as string) || 'archivo'

  // ?descargar=1 — bajar el archivo en vez de abrirlo.
  //
  // El `download` se lo pide a Supabase en vez de proxear los bytes acá: la
  // RESPUESTA de una función de Vercel también topa en 4,5 MB, así que pasar un
  // PDF grande por acá lo rompería igual que antes rompía la subida.
  if (new URL(req.url).searchParams.has('descargar')) {
    const { data, error } = await almacen.createSignedUrl(ruta, 60, { download: nombre })
    if (error || !data) {
      return NextResponse.json({ success: false, error: 'No se pudo abrir el archivo' }, { status: 500 })
    }
    return NextResponse.redirect(data.signedUrl)
  }

  // Las páginas HTML se sirven DESDE ACÁ, no por redirección.
  //
  // Por qué: Supabase entrega todo lo que huela a HTML como `text/plain` y
  // encima con `X-Content-Type-Options: nosniff`. Es una protección suya
  // deliberada —evita que alguien aloje una página que corra en su dominio— y
  // no se puede desactivar. El efecto para nosotros era que la "vista previa"
  // mostraba el código: el visor estaba bien, el archivo llegaba mal etiquetado.
  //
  // Al servirlo acá se puede poner el `Content-Type` de verdad. El riesgo de
  // hacerlo —HTML ajeno corriendo en nuestro dominio— se cierra con
  // `Content-Security-Policy: sandbox`, que obliga al navegador a tratar la
  // respuesta como origen opaco: sin cookies, sin sesión, sin acceso al CRM.
  // Vale aunque alguien abra la URL suelta, fuera del iframe.
  const esPagina =
    adjunto.tipo_mime === 'text/html' || /\.html?$/i.test(nombre)
  const bytes = Number(adjunto.bytes ?? 0)

  // Solo si entra cómodo en la respuesta de la función. Una página más pesada
  // que esto no existe en la práctica, pero si aparece va por el camino de
  // siempre en vez de fallar.
  if (esPagina && bytes > 0 && bytes < 3 * 1024 * 1024) {
    const { data, error } = await almacen.download(ruta)
    if (!error && data) {
      return new NextResponse(await data.arrayBuffer(), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-forms',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=60',
        },
      })
    }
  }

  const { data: firmada, error } = await almacen.createSignedUrl(ruta, 60)

  if (error || !firmada) {
    return NextResponse.json({ success: false, error: 'No se pudo abrir el archivo' }, { status: 500 })
  }

  return NextResponse.redirect(firmada.signedUrl)
}
