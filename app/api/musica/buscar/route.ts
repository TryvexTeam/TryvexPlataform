import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { MusicaRepository } from '@/lib/repos/musica'
import { duracionISOaSegundos, extraerVideoId, type Pista } from '@/lib/types/musica'

export const dynamic = 'force-dynamic'

const API = 'https://www.googleapis.com/youtube/v3'
const MAX_RESULTADOS = 8

/**
 * Buscar algo para poner.
 *
 * Dos caminos, y la diferencia entre ellos no es un detalle de implementacion:
 *
 *   URL pegada -> `videos.list`, cuesta 1 unidad
 *   texto      -> `search.list`, cuesta 100 unidades
 *
 * La cuota diaria es de 10.000 y no se puede comprar mas: son exactamente 100
 * busquedas por texto al dia para todo el equipo. Por eso toda busqueda por texto
 * pasa primero por el cache, y por eso pegar el link siempre esta disponible --
 * es el camino que sigue funcionando cuando la cuota ya se acabo.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  // `getByAuthUser` ya filtra por `activo`: un integrante dado de baja no puede
  // seguir gastando la cuota del equipo.
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const consulta = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (!consulta) return NextResponse.json({ success: false, error: 'Falta la búsqueda' }, { status: 400 })

  const clave = process.env.YOUTUBE_API_KEY
  const musica = new MusicaRepository(supabase)
  const videoId = extraerVideoId(consulta)

  // Sin clave, un enlace pegado igual funciona: los datos salen de oEmbed, que
  // es público y no pide credenciales. Es lo que hace que la función sirva desde
  // el minuto cero, sin depender de que alguien pase por Google Cloud.
  //
  // El mensaje anterior decía "mientras tanto pegue un enlace", pero el camino
  // del enlace TAMBIÉN pasaba por la API: mandaba a la persona a un callejón sin
  // salida. La diferencia entre buscar y pegar era de cuota (100 unidades contra
  // 1), no de credencial.
  if (!clave) {
    if (videoId) {
      const pista = await porOEmbed(videoId)
      if (pista) return NextResponse.json({ success: true, data: [pista] })
      return NextResponse.json(
        { success: false, error: 'Ese enlace no se pudo leer. ¿Es un video público de YouTube?' },
        { status: 404 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error:
          'Para buscar por nombre falta configurar YOUTUBE_API_KEY. Pegando el enlace del video funciona igual, sin clave.',
      },
      { status: 503 },
    )
  }

  try {
    if (videoId) {
      const pista = await porId(videoId, clave)
      if (!pista) {
        return NextResponse.json(
          { success: false, error: 'Ese video no existe o no se puede reproducir incrustado' },
          { status: 404 },
        )
      }
      return NextResponse.json({ success: true, data: [pista] })
    }

    const cacheadas = await musica.busquedaCacheada(consulta)
    if (cacheadas) return NextResponse.json({ success: true, data: cacheadas })

    const resultados = await buscarTexto(consulta, clave)
    await musica.guardarBusqueda(consulta, resultados)
    return NextResponse.json({ success: true, data: resultados })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error buscando en YouTube' },
      { status: 502 },
    )
  }
}

// ── YouTube Data API ────────────────────────────────────────────────────────

type ItemVideo = {
  id: string
  snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> }
  contentDetails?: { duration?: string }
  status?: { embeddable?: boolean }
}

/**
 * Una URL pegada. `videos.list` cuesta 1 unidad, dos ordenes de magnitud menos
 * que buscar, y de paso trae la duracion, que la busqueda no incluye.
 *
 * Se pide `status` para descartar lo que no se puede incrustar: encolar un video
 * bloqueado deja la cola trabada en una pista que nadie puede reproducir, y como
 * el avance automatico depende de que el reproductor llegue al final, la sala se
 * queda muerta hasta que alguien salte a mano.
 */
/**
 * Los datos de un video sin usar la API ni una clave.
 *
 * oEmbed es un endpoint público de YouTube: devuelve título, canal y miniatura
 * de cualquier video público e incrustable. Si el video no se puede incrustar,
 * responde error -- así que sirve además como filtro, que es justo lo que hacía
 * falta para no encolar una pista que nadie va a poder reproducir.
 *
 * Lo único que NO da es la duración. Se deja en 0 y la completa el reproductor
 * cuando carga el video, que es quien realmente la sabe. Mientras tanto la cola
 * no puede calcular sola cuándo avanzar, pero el fin de pista igual llega por el
 * evento del reproductor.
 */
async function porOEmbed(videoId: string): Promise<Pista | null> {
  try {
    const url = new URL('https://www.youtube.com/oembed')
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`)
    url.searchParams.set('format', 'json')

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const datos = (await res.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }

    return {
      video_id: videoId,
      titulo: datos.title ?? 'Video de YouTube',
      canal: datos.author_name ?? '',
      duracion_seg: 0,
      miniatura_url: datos.thumbnail_url ?? null,
      // Lo completa el route de comandos con quien la encoló; acá todavía no se
      // sabe, es solo el resultado de una búsqueda.
      puesta_por: null,
    }
  } catch {
    return null
  }
}

async function porId(videoId: string, clave: string): Promise<Pista | null> {
  const url = new URL(`${API}/videos`)
  url.searchParams.set('part', 'snippet,contentDetails,status')
  url.searchParams.set('id', videoId)
  url.searchParams.set('key', clave)

  const items = await pedir<ItemVideo>(url)
  const item = items[0]
  if (!item || item.status?.embeddable === false) return null
  return aPista(item)
}

/**
 * Buscar por texto. Los 100 puntos.
 *
 * `videoEmbeddable` y `videoSyndicated` van en la propia busqueda para que lo que
 * no se puede incrustar ni salir de youtube.com no llegue nunca a la lista. Es
 * mas barato filtrar aca que descubrirlo cuando la pista ya esta sonando en la
 * sala de cinco personas.
 *
 * `search.list` no devuelve duraciones, asi que hace falta un `videos.list`
 * encima (1 unidad mas, contra 100 del search: el costo relevante ya se pago).
 * Sin duracion, la cola no sabria cuando avanzar.
 */
async function buscarTexto(consulta: string, clave: string): Promise<Pista[]> {
  const url = new URL(`${API}/search`)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('videoSyndicated', 'true')
  url.searchParams.set('maxResults', String(MAX_RESULTADOS))
  url.searchParams.set('q', consulta)
  url.searchParams.set('key', clave)

  const encontrados = await pedir<{ id?: { videoId?: string } }>(url)
  const ids = encontrados.map((r) => r.id?.videoId).filter((id): id is string => Boolean(id))
  if (ids.length === 0) return []

  const detalles = new URL(`${API}/videos`)
  detalles.searchParams.set('part', 'snippet,contentDetails,status')
  detalles.searchParams.set('id', ids.join(','))
  detalles.searchParams.set('key', clave)

  const items = await pedir<ItemVideo>(detalles)
  return items.filter((i) => i.status?.embeddable !== false).map(aPista)
}

async function pedir<T>(url: URL): Promise<T[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const json = (await res.json().catch(() => null)) as
    | { items?: T[]; error?: { message?: string; errors?: { reason?: string }[] } }
    | null

  if (!res.ok) {
    // La cuota agotada merece su propio mensaje: "403" no le dice nada a nadie, y
    // la salida es distinta (esperar a mañana o pegar un link, no reintentar).
    const razon = json?.error?.errors?.[0]?.reason
    if (razon === 'quotaExceeded') {
      throw new Error('Se acabó la cuota diaria de búsqueda de YouTube. Se puede pegar el enlace del video igual.')
    }
    throw new Error(json?.error?.message ?? `YouTube respondió ${res.status}`)
  }

  return json?.items ?? []
}

function aPista(item: ItemVideo): Pista {
  const miniaturas = item.snippet?.thumbnails ?? {}
  return {
    video_id: item.id,
    titulo: item.snippet?.title ?? 'Sin título',
    canal: item.snippet?.channelTitle ?? '',
    duracion_seg: duracionISOaSegundos(item.contentDetails?.duration ?? ''),
    miniatura_url: miniaturas.medium?.url ?? miniaturas.default?.url ?? null,
    // Lo llena la ruta de comandos con el integrante que la encoló: acá todavía no
    // se sabe quién la va a poner, solo qué es.
    puesta_por: null,
  }
}
