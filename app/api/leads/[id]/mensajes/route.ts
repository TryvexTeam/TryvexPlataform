import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MensajesWaRepository } from '@/lib/repos/mensajes-wa'

/**
 * GET /api/leads/[id]/mensajes
 * Hilo de WhatsApp del lead (tabla `mensajes_wa`), orden cronológico.
 * Lee a través de `MensajesWaRepository` (capa de datos del wa-bridge), así la
 * vista no duplica queries: cuando el puente empieza a poblar la tabla, este
 * endpoint ya la sirve sin cambios.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const repo = new MensajesWaRepository(supabase)
    const mensajes = await repo.hiloPorLead(id)
    return NextResponse.json({ success: true, data: mensajes })
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json(
      { success: false, error: `No se pudo leer el hilo: ${detail}` },
      { status: 500 }
    )
  }
}
