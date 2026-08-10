import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { PerfilUpdateSchema } from '@/lib/types/integrante'
import { revalidarEquipoEnLanding } from '@/lib/revalidate-landing'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const repo = new IntegrantesRepository(supabase)
  const [perfil, equipo] = await Promise.all([
    repo.getByAuthUser(user.id),
    repo.listActivos(),
  ])
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  return NextResponse.json({ success: true, data: { perfil, equipo } })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const result = PerfilUpdateSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ success: false, error: result.error.issues }, { status: 400 })

  const repo = new IntegrantesRepository(supabase)
  const perfil = await repo.getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  try {
    await repo.updatePerfil(perfil.id, result.data)
  } catch (err) {
    if (err instanceof Error && err.message === 'color_ocupado') {
      return NextResponse.json(
        { success: false, error: 'Ese color ya lo usa otro integrante' },
        { status: 409 }
      )
    }
    throw err
  }

  // No bloquea la respuesta al usuario ni falla el guardado si la landing
  // no responde — ver revalidarEquipoEnLanding().
  void revalidarEquipoEnLanding()

  return NextResponse.json({ success: true })
}
