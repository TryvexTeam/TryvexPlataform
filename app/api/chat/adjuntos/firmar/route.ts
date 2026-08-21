import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { validarArchivos, MAX_ARCHIVOS } from '@/lib/types/adjuntos'
import { sanearNombreArchivo, BUCKET_ADJUNTOS } from '@/lib/chat/adjuntos-servidor'

/**
 * Entrega URLs firmadas para que el NAVEGADOR suba los archivos directo a
 * Supabase Storage.
 *
 * Por qué no se suben por la ruta del mensaje, como antes: el CRM corre en
 * Vercel, y una función de Vercel rechaza cualquier body de más de 4,5 MB
 * (`413 FUNCTION_PAYLOAD_TOO_LARGE`). Es un límite de infraestructura: no se
 * cambia por config. La ruta prometía 25 MB y en producción ninguno de los 12
 * adjuntos subidos llegó a superar los 2,1 MB — el techo nunca fue el declarado.
 *
 * Con la subida directa el archivo no pasa por la función, así que el límite
 * que se valida acá es el que de verdad manda.
 *
 * Acá se decide QUIÉN puede subir y DÓNDE; el contenido lo pone el navegador.
 * Por eso la ruta la arma el servidor y nunca se acepta una que venga de fuera:
 * si el cliente eligiera la ruta, podría escribir en la carpeta de otra
 * conversación.
 */

const CuerpoSchema = z.object({
  conversacion_id: z.string().uuid(),
  archivos: z
    .array(
      z.object({
        nombre: z.string().min(1).max(255),
        bytes: z.number().int().nonnegative(),
        tipo_mime: z.string().max(150).optional(),
      }),
    )
    .min(1)
    .max(MAX_ARCHIVOS),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const parsed = CuerpoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    )
  }
  const { conversacion_id, archivos } = parsed.data

  // Firmar es dar permiso de escritura: se comprueba la pertenencia ANTES, no
  // al guardar el mensaje. Si no, cualquiera con sesión podría dejar archivos
  // en la carpeta de una conversación ajena aunque después no pudiera postear.
  if (!(await new ChatRepository(supabase).esMiembro(conversacion_id, perfil.id))) {
    return NextResponse.json(
      { success: false, error: 'No perteneces a esa conversación' },
      { status: 403 },
    )
  }

  const problema = validarArchivos(archivos)
  if (problema) return NextResponse.json({ success: false, error: problema }, { status: 400 })

  const admin = createAdminClient()
  const lote = crypto.randomUUID()
  const firmados = []

  for (const [i, archivo] of archivos.entries()) {
    // Carpeta por conversación y por lote: se puede limpiar un hilo entero de
    // una, y dos envíos simultáneos no se pisan el nombre.
    const ruta = `${conversacion_id}/${lote}/${i}-${sanearNombreArchivo(archivo.nombre)}`

    const { data, error } = await admin.storage
      .from(BUCKET_ADJUNTOS)
      .createSignedUploadUrl(ruta)

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: `No se pudo preparar la subida de "${archivo.nombre}"` },
        { status: 500 },
      )
    }

    firmados.push({
      nombre: archivo.nombre,
      ruta,
      token: data.token,
      tipo_mime: archivo.tipo_mime || 'application/octet-stream',
      bytes: archivo.bytes,
    })
  }

  return NextResponse.json({ success: true, data: firmados })
}
