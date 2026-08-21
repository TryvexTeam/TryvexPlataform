import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { getPendientesDeAprobacion } from '@/lib/repos/invitaciones'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const yo = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!yo?.es_superadmin) {
    return NextResponse.json({ error: 'Solo un superadmin ve las invitaciones pendientes' }, { status: 403 })
  }

  const pendientes = await getPendientesDeAprobacion(supabase)
  return NextResponse.json({ success: true, data: pendientes })
}
