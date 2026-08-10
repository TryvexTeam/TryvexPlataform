import { NextResponse, after } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { revalidarEquipoEnLanding } from '@/lib/revalidate-landing'

/**
 * Foto de perfil del integrante.
 *
 * La subida pasa por acá y no directo al bucket: así el archivo se valida antes
 * de existir y nadie puede escribir en el storage de otro. El bucket es público
 * en lectura porque el avatar se pinta en cada burbuja del chat, y firmar una URL
 * por mensaje sería caro y se vencería a mitad de la conversación.
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

  const admin = createAdminClient()
  // Timestamp en el nombre: el bucket es público y con CDN, y reusar la ruta
  // dejaría la foto vieja cacheada.
  const ruta = `${perfil.id}/${Date.now()}.${ext}`

  const { error: errSubida } = await admin.storage
    .from('avatares')
    .upload(ruta, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })

  if (errSubida) {
    return NextResponse.json({ success: false, error: errSubida.message }, { status: 500 })
  }

  const { data: publica } = admin.storage.from('avatares').getPublicUrl(ruta)

  const { error: errPerfil } = await (admin as SB)
    .from('dim_integrantes')
    .update({ avatar_url: publica.publicUrl })
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

  return NextResponse.json({ success: true, data: { avatar_url: publica.publicUrl } })
}

/** Volver a la inicial con color: se borra la foto, no se esconde. */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const admin = createAdminClient()
  await (admin as SB).from('dim_integrantes').update({ avatar_url: null }).eq('id', perfil.id)
  await borrarAnteriores(admin, perfil.id, null)
  after(() => revalidarEquipoEnLanding())

  return NextResponse.json({ success: true })
}

/**
 * Deja solo la foto vigente. Sin esto cada cambio de avatar acumula un archivo
 * huérfano para siempre.
 */
async function borrarAnteriores(
  admin: ReturnType<typeof createAdminClient>,
  integranteId: string,
  conservar: string | null,
) {
  const { data } = await admin.storage.from('avatares').list(integranteId)
  const viejas = (data ?? [])
    .map((f) => `${integranteId}/${f.name}`)
    .filter((r) => r !== conservar)

  if (viejas.length > 0) await admin.storage.from('avatares').remove(viejas)
}
