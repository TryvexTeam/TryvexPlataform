import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { contarNoLeidos } from '@/lib/wa/no-leidos'

/**
 * GET /api/wa/no-leidos
 *
 * Cuantos mensajes entrantes de WhatsApp tiene sin leer cada lead.
 * Devuelve SOLO los leads que tienen alguno — la lista de leads es larga y
 * mandar 500 ceros por la red cada 20 segundos no le sirve a nadie.
 *
 * Existe porque el chat solo mira el hilo mientras esta abierto: con el chat
 * cerrado, sin esto, nadie se entera de que contestaron. Ver migracion 046.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  try {
    const [{ data: leads, error: errLeads }, { data: entrantes, error: errMsgs }] =
      await Promise.all([
        supabase.from('fact_leads').select('id, wa_leido_hasta'),
        supabase.from('mensajes_wa').select('lead_id, created_at').eq('direccion', 'in'),
      ])

    if (errLeads) throw errLeads
    if (errMsgs) throw errMsgs

    return NextResponse.json({ success: true, data: contarNoLeidos(leads ?? [], entrantes ?? []) })
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json(
      { success: false, error: `No se pudieron contar los no leidos: ${detail}` },
      { status: 500 }
    )
  }
}
