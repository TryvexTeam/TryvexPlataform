import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { AccesoRepository } from '@/lib/repos/acceso'
import { autorizarSuperadmin } from '@/app/api/admin/_auth'

export async function GET(req: Request) {
  const auth = await autorizarSuperadmin()
  if ('error' in auth) return auth.error
  const parsed = z.string().uuid().safeParse(new URL(req.url).searchParams.get('integrante'))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Integrante inválido' }, { status: 400 })
  try {
    return NextResponse.json({ success: true, data: await new AccesoRepository(createAdminClient()).ipsParaDesvincular(parsed.data) })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No se pudieron consultar las IPs' }, { status: 500 })
  }
}
