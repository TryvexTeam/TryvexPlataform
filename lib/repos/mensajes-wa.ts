import { createClient } from '@/lib/supabase/server'
import type { MensajeWa, MensajeWaSalienteInsert } from '@/lib/types/mensaje-wa'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class MensajesWaRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Hilo completo de un lead, orden cronológico — para la vista de Leads (Jarvis). */
  async hiloPorLead(leadId: string): Promise<MensajeWa[]> {
    const { data, error } = await this.sb
      .from('mensajes_wa')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      // Techo de seguridad: un hilo con miles de mensajes no debería poder
      // colgar esta vista. 2000 cubre con margen cualquier conversación real
      // de hoy sin cambiar el comportamiento actual.
      .limit(2000)

    if (error) throw new Error(error.message)
    return (data ?? []) as MensajeWa[]
  }

  /** Leads con al menos un mensaje entrante — "quién respondió" (consumido por Vex/Ariel). */
  async leadIdsConRespuesta(): Promise<string[]> {
    const { data, error } = await this.sb
      .from('mensajes_wa')
      .select('lead_id')
      .eq('direccion', 'in')
      .not('lead_id', 'is', null)

    if (error) throw new Error(error.message)
    const ids = new Set<string>((data ?? []).map((r: { lead_id: string }) => r.lead_id))
    return Array.from(ids)
  }

  /** Registra un mensaje saliente (lo escribe el wa-bridge tras confirmar el envío). */
  async registrarSaliente(msg: MensajeWaSalienteInsert & { waMessageId?: string | null }): Promise<string> {
    const { data, error } = await this.sb
      .from('mensajes_wa')
      .insert({
        lead_id: msg.lead_id ?? null,
        cliente_id: msg.cliente_id ?? null,
        direccion: 'out',
        texto: msg.texto,
        wa_message_id: msg.waMessageId ?? null,
        chip_id: msg.chip_id ?? null,
        es_bot: msg.es_bot,
        enviado_por: msg.enviado_por,
        estado_envio: 'enviado',
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return (data as { id: string }).id
  }
}
