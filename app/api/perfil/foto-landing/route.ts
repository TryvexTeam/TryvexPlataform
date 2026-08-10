import { NextResponse, after } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { revalidarEquipoEnLanding } from '@/lib/revalidate-landing'

/**
 * Foto para la ficha pública de tryvex.tech/team.
 *
 * Por qué existe aparte del avatar: el avatar se sube pensando en el chat, donde
 * se pinta a 32px, y ahí una imagen chica se ve impecable. En la landing la misma
 * imagen se muestra grande y se nota pixelada -- y el que lo descubre es un
 * cliente. Esta ruta permite subir una foto en buena resolución sin tocar el
 * avatar, y rechaza en el momento lo que se vería mal publicado.
 *
 * Mismo criterio que /api/perfil/avatar: se sube por acá y no directo al bucket,
 * así el archivo se valida antes de existir y nadie escribe en el storage de otro.
 * Comparte el bucket `avatares` (público en lectura) bajo un prefijo propio.
 */

// Mismo escape que usan los repos: los tipos generados de la base están viejos y
// no conocen las columnas nuevas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

const TIPOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MAX_MB = 5

/** Lado mínimo aceptado. Debajo de esto la foto se ve rota en la landing. */
const MIN_LADO = 400

/** Carpeta propia dentro del bucket, para no mezclarse con los avatares. */
const PREFIJO = 'landing'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Falta la imagen' }, { status: 400 })
  }

  const ext = TIPOS[file.type]
  if (!ext) {
    return NextResponse.json(
      { success: false, error: 'Formato no soportado. Usa jpg, png, webp o gif.' },
      { status: 400 },
    )
  }

  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json(
      { success: false, error: `La imagen supera los ${MAX_MB}MB` },
      { status: 400 },
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())

  // El mensaje dice el mínimo Y lo que llegó: sin el tamaño recibido, la persona
  // no sabe si le faltan 10px o si mandó un ícono.
  const medidas = leerDimensiones(bytes)
  if (medidas && (medidas.ancho < MIN_LADO || medidas.alto < MIN_LADO)) {
    return NextResponse.json(
      {
        success: false,
        error:
          `La foto es muy chica para la web: ${medidas.ancho}x${medidas.alto} px. ` +
          `El mínimo es ${MIN_LADO}x${MIN_LADO} px.`,
      },
      { status: 400 },
    )
  }
  // medidas === null: formato válido cuyo encabezado no supimos leer. Se acepta.
  // Bloquear ahí dejaría a alguien sin poder subir una foto que está perfecta,
  // que es peor que dejar pasar una imagen rara.

  const admin = createAdminClient()
  // Timestamp en el nombre: el bucket es público y con CDN, y reusar la ruta
  // dejaría la foto vieja cacheada.
  const ruta = `${PREFIJO}/${perfil.id}/${Date.now()}.${ext}`

  const { error: errSubida } = await admin.storage
    .from('avatares')
    .upload(ruta, bytes, { contentType: file.type, upsert: false })

  if (errSubida) {
    return NextResponse.json({ success: false, error: errSubida.message }, { status: 500 })
  }

  const { data: publica } = admin.storage.from('avatares').getPublicUrl(ruta)

  const { error: errPerfil } = await (admin as SB)
    .from('dim_integrantes')
    .update({ foto_landing_url: publica.publicUrl })
    .eq('id', perfil.id)

  if (errPerfil) {
    // El archivo ya está arriba pero nadie lo referencia: se limpia para no dejar
    // basura en el bucket.
    await admin.storage.from('avatares').remove([ruta])
    return NextResponse.json({ success: false, error: errPerfil.message }, { status: 500 })
  }

  await borrarAnteriores(admin, perfil.id, ruta)
  // Va en after() y no suelta como promesa: al devolver la respuesta el runtime
  // puede congelar la invocación antes de que el fetch llegue a salir.
  after(() => revalidarEquipoEnLanding())

  return NextResponse.json({ success: true, data: { foto_landing_url: publica.publicUrl } })
}

/** Quitarla vuelve la landing al avatar del CRM, que es el comportamiento previo. */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await (admin as SB)
    .from('dim_integrantes')
    .update({ foto_landing_url: null })
    .eq('id', perfil.id)

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  await borrarAnteriores(admin, perfil.id, null)
  after(() => revalidarEquipoEnLanding())

  return NextResponse.json({ success: true })
}

/**
 * Deja solo la foto vigente. Sin esto cada cambio acumula un archivo huérfano
 * para siempre.
 */
async function borrarAnteriores(
  admin: ReturnType<typeof createAdminClient>,
  integranteId: string,
  conservar: string | null,
) {
  const carpeta = `${PREFIJO}/${integranteId}`
  const { data } = await admin.storage.from('avatares').list(carpeta)
  const viejas = (data ?? [])
    .map((f) => `${carpeta}/${f.name}`)
    .filter((r) => r !== conservar)

  if (viejas.length > 0) await admin.storage.from('avatares').remove(viejas)
}

/**
 * Dimensiones leídas del encabezado del archivo, sin dependencias nuevas.
 *
 * Por qué a mano y no con `sharp` o `image-size`: agregar un binario nativo al
 * runtime serverless por leer 8 bytes es desproporcionado. Los encabezados de
 * PNG, JPEG, WebP y GIF son estables y están en los primeros cientos de bytes.
 *
 * Devuelve `null` cuando no puede afirmar el tamaño. El que llama trata ese null
 * como "aceptar": preferimos dejar pasar una imagen rara antes que bloquear a
 * alguien con un archivo válido que no supimos parsear.
 */
function leerDimensiones(b: Buffer): { ancho: number; alto: number } | null {
  return leerPng(b) ?? leerGif(b) ?? leerWebp(b) ?? leerJpeg(b)
}

/** PNG: firma de 8 bytes, chunk IHDR obligatorio primero, ancho y alto big-endian. */
function leerPng(b: Buffer): { ancho: number; alto: number } | null {
  if (b.length < 24) return null
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) }
}

/** GIF: 'GIF87a'/'GIF89a' y el canvas en little-endian de 16 bits. */
function leerGif(b: Buffer): { ancho: number; alto: number } | null {
  if (b.length < 10) return null
  const firma = b.toString('ascii', 0, 6)
  if (firma !== 'GIF87a' && firma !== 'GIF89a') return null
  return { ancho: b.readUInt16LE(6), alto: b.readUInt16LE(8) }
}

/**
 * WebP: contenedor RIFF con tres variantes de chunk, cada una con su formato.
 * VP8 (lossy), VP8L (lossless) y VP8X (extendido, el de los animados y alpha).
 */
function leerWebp(b: Buffer): { ancho: number; alto: number } | null {
  if (b.length < 30) return null
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null

  const chunk = b.toString('ascii', 12, 16)

  if (chunk === 'VP8 ') {
    // 3 bytes de frame tag, el código de sincronía 9d 01 2a, y luego 14 bits de
    // ancho y 14 de alto (los 2 bits altos son el factor de escala).
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { ancho: b.readUInt16LE(26) & 0x3fff, alto: b.readUInt16LE(28) & 0x3fff }
  }

  if (chunk === 'VP8L') {
    // Byte de firma 0x2f y después 28 bits empaquetados: 14 de (ancho-1) y 14 de
    // (alto-1), en un entero little-endian.
    if (b[20] !== 0x2f) return null
    const bits = b.readUInt32LE(21)
    return { ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 }
  }

  if (chunk === 'VP8X') {
    // 4 bytes de flags y luego el canvas: dos enteros de 24 bits little-endian,
    // guardados como valor-1.
    const leer24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
    return { ancho: leer24(24) + 1, alto: leer24(27) + 1 }
  }

  return null
}

/**
 * JPEG: no hay un offset fijo, hay que recorrer los segmentos hasta dar con un
 * marcador SOF (Start Of Frame). SOF0 es el baseline y SOF2 el progresivo, que
 * son los que sale de cualquier cámara o export; se contemplan también las demás
 * variantes porque la estructura del segmento es idéntica.
 *
 * Se saltean DNL (0xC4), DAC (0xCC) y RSTn (0xD0-0xD7), que caen en el mismo
 * rango numérico pero no son SOF.
 */
function leerJpeg(b: Buffer): { ancho: number; alto: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null

  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++ // relleno entre segmentos; se avanza hasta el próximo marcador
      continue
    }
    const marcador = b[i + 1]
    if (marcador === 0xff) {
      i++
      continue
    }
    // SOS (0xDA) marca el inicio de los datos comprimidos: más allá no hay SOF.
    if (marcador === 0xda || marcador === 0xd9) return null

    const largo = b.readUInt16BE(i + 2)
    if (largo < 2) return null

    const esSof =
      (marcador >= 0xc0 && marcador <= 0xcf) &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc
    if (esSof) {
      // Dentro del segmento: 1 byte de precisión, 2 de alto, 2 de ancho.
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) }
    }

    i += 2 + largo
  }
  return null
}
