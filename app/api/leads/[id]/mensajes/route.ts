import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MensajesWaRepository } from '@/lib/repos/mensajes-wa'

/**
 * GET /api/leads/[id]/mensajes
 * Hilo de WhatsApp del lead, orden cronológico. Usa el repositorio compartido
 * `MensajesWaRepository` (capa de datos de mensajes_wa) — la vista de Leads lo
 * consume para pintar el chat embebido.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new MensajesWaRepository(supabase)
  try {
    const mensajes = await repo.hiloPorLead(id)
    return NextResponse.json({ mensajes })
  } catch (e) {
    return NextResponse.json(
      { error: 'No se pudo leer el hilo', detail: String(e) },
      { status: 500 }
    )
  }
}
