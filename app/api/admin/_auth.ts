import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'

export type ActorAcceso = { id: string; nombre: string; email: string }

export async function autorizarSuperadmin(): Promise<{ error: NextResponse } | { actor: ActorAcceso }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }) }
  const yo = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!yo?.activo || !yo.es_superadmin) {
    return { error: NextResponse.json({ success: false, error: 'Solo el administrador puede realizar esta acción' }, { status: 403 }) }
  }
  return { actor: { id: yo.id, nombre: yo.nombre, email: yo.email } }
}
