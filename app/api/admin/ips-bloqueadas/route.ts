import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { AccesoRepository } from '@/lib/repos/acceso'
import { IpQuerySchema } from '@/lib/types/acceso'
import { autorizarSuperadmin } from '@/app/api/admin/_auth'

export async function GET() {
  const auth = await autorizarSuperadmin()
  if ('error' in auth) return auth.error
  try {
    return NextResponse.json({ success: true, data: await new AccesoRepository(createAdminClient()).listIpsBloqueadas() })
  } catch (error) {
    console.error('[admin/ips-bloqueadas] fallo al leer:', error)
    return NextResponse.json({ success: false, error: 'No se pudieron leer las IPs' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await autorizarSuperadmin()
  if ('error' in auth) return auth.error
  const parsed = IpQuerySchema.safeParse({ ip: new URL(req.url).searchParams.get('ip') })
  if (!parsed.success) return NextResponse.json({ success: false, error: 'IP inválida' }, { status: 400 })
  try {
    await new AccesoRepository(createAdminClient()).desbloquearIp(parsed.data.ip)
    return NextResponse.json({ success: true, data: { ip: parsed.data.ip } })
  } catch (error) {
    console.error('[admin/ips-bloqueadas] fallo al desbloquear:', error)
    return NextResponse.json({ success: false, error: 'No se pudo desbloquear' }, { status: 500 })
  }
}
