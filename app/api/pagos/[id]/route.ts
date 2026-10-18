import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PagosRepository } from '@/lib/repos/pagos'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { VentaUpdateSchema } from '@/lib/types/proyecto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'gestionar_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin permiso para editar pagos' }, { status: 403 })
  }

  const result = VentaUpdateSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  const repo = new PagosRepository(supabase)
  await repo.update(id, result.data)
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'gestionar_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin permiso para borrar pagos' }, { status: 403 })
  }

  const repo = new PagosRepository(supabase)
  await repo.delete(id)
  return NextResponse.json({ success: true })
}
