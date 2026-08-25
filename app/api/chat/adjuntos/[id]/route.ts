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

  const params = new URL(req.url).searchParams

  // ?descargar=1 — bajar el archivo en vez de abrirlo.
  //
  // El `download` se lo pide a Supabase en vez de proxear los bytes acá: la
  // RESPUESTA de una función de Vercel también topa en 4,5 MB, así que pasar un
  // PDF grande por acá lo rompería igual que antes rompía la subida.
  if (params.has('descargar')) {
    const { data, error } = await almacen.createSignedUrl(ruta, 60, { download: nombre })
    if (error || !data) {
      return NextResponse.json({ success: false, error: 'No se pudo abrir el archivo' }, { status: 500 })
    }
    return NextResponse.redirect(data.signedUrl)
  }

  // ?firmar=1 — entrega una URL firmada TEMPORAL, en JSON, para que un visor
  // externo pueda leer el archivo.
  //
  // Word, Excel y PowerPoint no los dibuja ningún navegador por su cuenta; el
  // visor online de Microsoft Office sí, pero para hacerlo sus servidores tienen
  // que poder abrir el archivo, y el bucket es privado. Esta rama devuelve un
  // enlace que vence en 10 minutos —lo justo para que el visor lo lea— y solo lo
  // obtiene quien ya pasó el control de pertenencia de más arriba.
  //
  // ⚠️ Es la única vía por la que un archivo del chat sale hacia un tercero.
  // Fue una decisión pedida a propósito para poder previsualizar ofimática; si
  // se quiere cero terceros, hay que convertir a PDF del lado nuestro (VPS).
  if (params.has('firmar')) {
    const { data, error } = await almacen.createSignedUrl(ruta, 600)
    if (error || !data) {
      return NextResponse.json({ success: false, error: 'No se pudo firmar el archivo' }, { status: 500 })
    }
    return NextResponse.json({ success: true, url: data.signedUrl })
  }

  // ?pdf=check / ?pdf=1 — el PDF con FORMATO de un Word o Excel.
  //
  // Word/Excel se ven fiel (membrete, portada, diseño) solo como PDF. Un
  // servicio en nuestro VPS los convierte con LibreOffice y deja el resultado en
  // `_pdf/<id>.pdf` dentro del mismo bucket (ver `ops/office-pdf/`). Acá:
  //  · `?pdf=check` responde si ese PDF ya está listo (el navegador decide si
  //    muestra el PDF o cae al render de texto mientras el VPS lo prepara).
  //  · `?pdf=1` lo sirve, con la misma lógica que un PDF normal: inline si cabe
  //    en la respuesta de Vercel, si no por redirección.
  // Todo pasa por nuestro origen: el archivo no sale hacia ningún tercero.
  if (params.has('pdf')) {
    const rutaPdf = `_pdf/${id}.pdf`
    const { data: firmadaPdf, error: errFirma } = await almacen.createSignedUrl(rutaPdf, 60)
    const listo = !errFirma && !!firmadaPdf

    if (params.get('pdf') === 'check') {
      return NextResponse.json({ success: true, listo })
    }
    if (!listo || !firmadaPdf) {
      return NextResponse.json({ success: false, pendiente: true }, { status: 404 })
    }

    const TOPE_INLINE = 3 * 1024 * 1024
    const { data: contenido, error: errBaja } = await almacen.download(rutaPdf)
    if (!errBaja && contenido) {
      const buf = await contenido.arrayBuffer()
      if (buf.byteLength < TOPE_INLINE) {
        return new NextResponse(buf, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline',
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, max-age=300',
          },
        })
      }
    }
    return NextResponse.redirect(firmadaPdf.signedUrl)
  }

  // Los archivos livianos se sirven DESDE ACÁ, no por redirección.
  //
  // Dos motivos, los dos comprobados contra los archivos reales del chat:
  //
  //  · **El HTML llegaba mal etiquetado.** Supabase entrega todo lo que huela a
  //    HTML como `text/plain` y encima con `X-Content-Type-Options: nosniff`.
  //    Es protección suya deliberada y no se desactiva, así que la vista previa
  //    mostraba el código: el visor estaba bien, el archivo llegaba como texto.
  //
  //  · **El PDF sí llega bien etiquetado** (`application/pdf`), pero al llegar
  //    por una redirección a otro dominio el navegador no lo dibuja dentro del
  //    iframe: muestra un botón "Abrir" y hay que dar un clic de más. Sirviendo
  //    desde el mismo origen y con `Content-Disposition: inline` se dibuja solo.
  //
  // El riesgo de servir HTML ajeno desde nuestro dominio se cierra con
  // `Content-Security-Policy: sandbox`: el navegador lo trata como origen opaco
  // —sin cookies, sin sesión, sin acceso al CRM— incluso si abren la URL suelta.
  const bytes = Number(adjunto.bytes ?? 0)
  const esPagina = adjunto.tipo_mime === 'text/html' || /\.html?$/i.test(nombre)
  const esPdf = adjunto.tipo_mime === 'application/pdf' || /\.pdf$/i.test(nombre)

  // Solo lo que entra cómodo en la respuesta: el tope de 4,5 MB de Vercel vale
  // para la RESPUESTA también, no solo para la petición. Lo más pesado sigue
  // por redirección, que funciona igual aunque pida ese clic de más.
  const CABE = 3 * 1024 * 1024

  if ((esPagina || esPdf) && bytes > 0 && bytes < CABE) {
    const { data, error } = await almacen.download(ruta)
    if (!error && data) {
      const cabeceras: Record<string, string> = {
        'Content-Type': esPagina ? 'text/html; charset=utf-8' : 'application/pdf',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=60',
      }
      if (esPagina) {
        cabeceras['Content-Security-Policy'] = 'sandbox allow-scripts allow-popups allow-forms'
      }
      return new NextResponse(await data.arrayBuffer(), { headers: cabeceras })
    }
  }

  const { data: firmada, error } = await almacen.createSignedUrl(ruta, 60)

  if (error || !firmada) {
    return NextResponse.json({ success: false, error: 'No se pudo abrir el archivo' }, { status: 500 })
  }

  return NextResponse.redirect(firmada.signedUrl)
}
