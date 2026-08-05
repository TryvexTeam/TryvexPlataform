import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

const TIPOS_PERMITIDOS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

const MAX_IMAGEN_MB = 8
const MAX_VIDEO_MB = 25

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  // El bucket es público: sin esta puerta, cualquier cuenta sube 25 MB de video
  // y queda alojado bajo el dominio de la empresa, sin cuota.
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Archivo requerido' }, { status: 400 })
  }

  const ext = TIPOS_PERMITIDOS[file.type]
  if (!ext) {
    return NextResponse.json(
      { success: false, error: 'Formato no soportado (jpg, png, webp, gif, mp4, webm)' },
      { status: 400 }
    )
  }

  const esVideo = file.type.startsWith('video/')
  const maxMb = esVideo ? MAX_VIDEO_MB : MAX_IMAGEN_MB
  if (file.size > maxMb * 1024 * 1024) {
    return NextResponse.json(
      { success: false, error: `El archivo supera el máximo de ${maxMb}MB` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const path = `${user.id}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await admin.storage
    .from('wallpapers')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const { data } = admin.storage.from('wallpapers').getPublicUrl(path)
  return NextResponse.json({ success: true, data: { url: data.publicUrl } }, { status: 201 })
}
