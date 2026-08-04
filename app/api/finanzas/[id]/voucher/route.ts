import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FinanzasRepository } from '@/lib/repos/finanzas'
import { PermisosRepository, puede } from '@/lib/repos/permisos'

/**
 * Devuelve una URL firmada para ver el comprobante.
 *
 * El bucket es privado: no se entrega una URL permanente porque un comprobante lleva
 * montos, nombres y a veces datos bancarios, y un link eterno se termina compartiendo.
 * Esta caduca en minutos.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'ver_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin acceso a finanzas' }, { status: 403 })
  }

  const repo = new FinanzasRepository(supabase)
  const mov = await repo.getById(id)
  if (!mov) return NextResponse.json({ success: false, error: 'No existe' }, { status: 404 })
  if (!mov.voucher_path) {
    return NextResponse.json({ success: false, error: 'Ese movimiento no tiene comprobante' }, { status: 404 })
  }

  const url = await repo.urlVoucher(mov.voucher_path)
  return NextResponse.json({ success: true, data: { url, nombre: mov.voucher_nombre } })
}
