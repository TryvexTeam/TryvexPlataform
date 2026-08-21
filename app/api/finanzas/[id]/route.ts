import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FinanzasRepository } from '@/lib/repos/finanzas'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { MovimientoUpdateSchema } from '@/lib/types/finanzas'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'gestionar_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin permiso para editar movimientos' }, { status: 403 })
  }

  const result = MovimientoUpdateSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  await new FinanzasRepository(supabase).update(id, result.data)
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'gestionar_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin permiso para borrar movimientos' }, { status: 403 })
  }

  await new FinanzasRepository(supabase).delete(id)
  return NextResponse.json({ success: true })
}
