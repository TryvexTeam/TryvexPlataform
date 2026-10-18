import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PagosRepository } from '@/lib/repos/pagos'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { VentaInsertSchema } from '@/lib/types/proyecto'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'gestionar_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin permiso para registrar pagos' }, { status: 403 })
  }

  const result = VentaInsertSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  const repo = new PagosRepository(supabase)
  const id = await repo.create(result.data)
  return NextResponse.json({ success: true, data: { id } }, { status: 201 })
}
