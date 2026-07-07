import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EventosRepository } from '@/lib/repos/eventos'
import { borrarEventoEnGoogle } from '@/lib/google/calendar-write'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new EventosRepository(supabase)
  const ref = await repo.getGoogleRef(id)
  await repo.delete(id) // RLS: solo el creador puede borrar

  // Evento nacido en el CRM con espejo en Google → borrar también allá (best-effort)
  if (ref?.origen === 'crm' && ref.google_event_id) {
    try {
      await borrarEventoEnGoogle(ref.google_event_id)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error borrando en Google'
      console.error('[eventos DELETE → google]', message)
    }
  }

  return NextResponse.json({ success: true })
}
