import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { aprobarInvitacion } from '@/lib/repos/invitaciones'

// La carpeta se llama [token] (no [id]) porque Next exige el mismo nombre
// de slug dinámico en todas las rutas del mismo nivel que ../[token]/route.ts
// — el valor real que viaja acá es el id (UUID) de la invitación, no su token.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const yo = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!yo?.es_superadmin) {
    return NextResponse.json({ error: 'Solo un superadmin puede aprobar invitaciones' }, { status: 403 })
  }

  const { token: id } = await params
  try {
    await aprobarInvitacion(supabase, id, yo.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al aprobar la invitación'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
