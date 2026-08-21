import { createClient } from '@/lib/supabase/client'
import { BUCKET_ADJUNTOS } from './adjuntos-servidor'

/**
 * Sube los adjuntos del chat DIRECTO a Supabase Storage, desde el navegador.
 *
 * Por qué no van por `/api/chat/mensajes` como antes: esa ruta corre en Vercel,
 * y una función de Vercel rechaza cualquier body de más de 4,5 MB con un
 * `413 FUNCTION_PAYLOAD_TOO_LARGE`. Es límite de infraestructura, no se cambia
 * por configuración. El código decía aceptar 25 MB y en producción ningún
 * adjunto había pasado nunca de 2,1 MB — el techo real era otro y nadie lo
 * sabía, porque el error ni siquiera llegaba legible a la pantalla.
 *
 * Yendo directo, el archivo no pasa por la función y el límite deja de aplicar.
 *
 * El servidor sigue mandando en lo que importa: es quien decide si tienes
 * permiso y en qué ruta puedes escribir (`/api/chat/adjuntos/firmar`). Acá solo
 * viaja el contenido.
 */

export type AdjuntoSubido = {
  ruta: string
  nombre: string
  tipo_mime: string
  bytes: number
  ancho?: number | null
  alto?: number | null
}

type Firmado = {
  nombre: string
  ruta: string
  token: string
  tipo_mime: string
  bytes: number
}

export async function subirAdjuntos(
  conversacionId: string,
  archivos: File[],
  alAvanzar?: (subidos: number, total: number) => void,
): Promise<AdjuntoSubido[]> {
  if (archivos.length === 0) return []

  const res = await fetch('/api/chat/adjuntos/firmar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversacion_id: conversacionId,
      archivos: archivos.map((f) => ({
        nombre: f.name,
        bytes: f.size,
        tipo_mime: f.type || undefined,
      })),
    }),
  })

  const json = await leerJSON(res)
  if (!res.ok || !json?.success) {
    throw new Error(json?.error ?? 'No se pudo preparar la subida')
  }

  const firmados = json.data as Firmado[]
  const supabase = createClient()
  const subidos: AdjuntoSubido[] = []

  for (const [i, firmado] of firmados.entries()) {
    const archivo = archivos[i]
    const { error } = await supabase.storage
      .from(BUCKET_ADJUNTOS)
      .uploadToSignedUrl(firmado.ruta, firmado.token, archivo, {
        contentType: archivo.type || 'application/octet-stream',
      })

    if (error) throw new Error(`No se pudo subir "${archivo.name}": ${error.message}`)

    // Las medidas se mandan para que la burbuja reserve el espacio y la
    // conversación no salte cuando termina de cargar la imagen.
    const medidas = await medirImagen(archivo)

    subidos.push({
      ruta: firmado.ruta,
      nombre: archivo.name,
      tipo_mime: archivo.type || 'application/octet-stream',
      bytes: archivo.size,
      ancho: medidas?.ancho ?? null,
      alto: medidas?.alto ?? null,
    })

    alAvanzar?.(i + 1, firmados.length)
  }

  return subidos
}

/**
 * Lee la respuesta como JSON sin reventar si no lo es.
 *
 * Existe por un caso real: cuando Vercel cortaba la subida por tamaño, la
 * respuesta era HTML y `await res.json()` lanzaba una excepción de parseo. La
 * persona veía un error de sintaxis incomprensible en vez de "el archivo es
 * muy grande" — el fallo quedaba disfrazado de bug del chat.
 */
export async function leerJSON(
  res: Response,
): Promise<{ success?: boolean; error?: string; data?: unknown } | null> {
  try {
    return await res.json()
  } catch {
    if (res.status === 413) {
      return { success: false, error: 'El archivo es demasiado grande para enviarse así' }
    }
    return { success: false, error: `El servidor respondió ${res.status} sin explicación` }
  }
}

/** Ancho y alto de una imagen, o null si no lo es (o si el navegador no puede). */
async function medirImagen(archivo: File): Promise<{ ancho: number; alto: number } | null> {
  if (!archivo.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(archivo)
    const medidas = { ancho: bitmap.width, alto: bitmap.height }
    bitmap.close()
    return medidas
  } catch {
    return null
  }
}
