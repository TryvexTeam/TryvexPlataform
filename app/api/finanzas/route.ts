import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { FinanzasRepository } from '@/lib/repos/finanzas'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { FiltroFinanzasSchema, MovimientoInsertSchema } from '@/lib/types/finanzas'

/**
 * La RLS de `movimientos_financieros` es la que manda: sin permiso, el SELECT vuelve
 * vacío y el INSERT falla. El chequeo explícito de aquí existe para devolver un 403
 * entendible en vez de una lista vacía o un error de Postgres.
 */

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'ver_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin acceso a finanzas' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const filtro = FiltroFinanzasSchema.safeParse({
    desde: searchParams.get('desde') ?? undefined,
    hasta: searchParams.get('hasta') ?? undefined,
    tipo: searchParams.get('tipo') ?? undefined,
    categoria: searchParams.get('categoria') ?? undefined,
  })
  if (!filtro.success) {
    return NextResponse.json({ success: false, error: filtro.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const movimientos = await new FinanzasRepository(supabase).list(filtro.data)
  return NextResponse.json({ success: true, data: movimientos })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!puede(perfil, 'gestionar_finanzas')) {
    return NextResponse.json({ success: false, error: 'Sin permiso para registrar movimientos' }, { status: 403 })
  }

  const result = MovimientoInsertSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const id = await new FinanzasRepository(supabase).create(result.data, perfil!.id)
  return NextResponse.json({ success: true, data: { id } }, { status: 201 })
}
