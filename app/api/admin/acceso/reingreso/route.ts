import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { AccesoRepository } from '@/lib/repos/acceso'
import { ReingresoSchema } from '@/lib/types/acceso'
import { autorizarSuperadmin } from '@/app/api/admin/_auth'

export async function POST(req: Request) {
  const auth = await autorizarSuperadmin()
  if ('error' in auth) return auth.error
  const parsed = ReingresoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 })
  const repo = new AccesoRepository(createAdminClient())
  try {
    const integrante = await repo.getIntegrante(parsed.data.integrante_id)
    if (!integrante) return NextResponse.json({ success: false, error: 'Ese integrante no existe' }, { status: 404 })
    await repo.permitirReingreso(integrante, auth.actor)
    return NextResponse.json({ success: true, data: { integrante_id: integrante.id } })
  } catch (error) {
    console.error('[admin/acceso/reingreso] fallo:', error)
    return NextResponse.json({ success: false, error: 'No se pudo permitir el reingreso' }, { status: 500 })
  }
}
