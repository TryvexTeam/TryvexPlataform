import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { AccesoRepository, ErrorAcceso } from '@/lib/repos/acceso'
import { DesvincularSchema } from '@/lib/types/acceso'
import { autorizarSuperadmin } from '@/app/api/admin/_auth'

export async function POST(req: Request) {
  const auth = await autorizarSuperadmin()
  if ('error' in auth) return auth.error
  const parsed = DesvincularSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  const { integrante_id, confirmacion, ips, motivo } = parsed.data
  if (integrante_id === auth.actor.id) return NextResponse.json({ success: false, error: 'No puedes desvincularte a ti mismo' }, { status: 400 })
  const repo = new AccesoRepository(createAdminClient())
  try {
    const integrante = await repo.getIntegrante(integrante_id)
    if (!integrante) return NextResponse.json({ success: false, error: 'Ese integrante no existe' }, { status: 404 })
    if (confirmacion !== integrante.nombre) return NextResponse.json({ success: false, error: 'La confirmación debe coincidir exactamente con el nombre' }, { status: 400 })
    if (integrante.es_superadmin && await repo.contarSuperadminsActivos() <= 1) {
      return NextResponse.json({ success: false, error: 'No puedes desvincular al último administrador activo' }, { status: 400 })
    }
    const candidatas = await repo.ipsParaDesvincular(integrante.id)
    const permitidas = new Set(candidatas.map((fila) => fila.ip))
    if (ips.some((ip) => !permitidas.has(ip))) return NextResponse.json({ success: false, error: 'La lista contiene una IP que no pertenece al integrante' }, { status: 400 })
    const resultado = await repo.desvincular({ integrante, ips, actor: auth.actor, motivo })
    return NextResponse.json({ success: true, data: resultado })
  } catch (error) {
    if (error instanceof ErrorAcceso) return NextResponse.json({ success: false, error: error.estado, etapa: error.etapa }, { status: 500 })
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No se pudo desvincular' }, { status: 500 })
  }
}
