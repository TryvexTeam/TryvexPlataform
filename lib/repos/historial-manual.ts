import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * El historial de conversación con un lead que el equipo anota a mano
 * (tabla `lead_historial_manual`, migración 118). Separado de `mensajes_wa`:
 * esto Vex no lo lee nunca.
 */

export const CANALES_HISTORIAL = ['whatsapp', 'llamada', 'otro'] as const

export const EntradaHistorialSchema = z.object({
  direccion: z.enum(['in', 'out']),
  texto: z.string().trim().min(1, 'El mensaje está vacío.').max(4000, 'Hasta 4000 caracteres por mensaje.'),
  ocurridoAt: z.string().datetime({ offset: true }).optional(),
  canal: z.enum(CANALES_HISTORIAL).default('whatsapp'),
})
export type EntradaHistorial = z.infer<typeof EntradaHistorialSchema>

/** Una o varias (al pegar un chat exportado). Tope para que un pegado gigante no tumbe nada. */
export const AnotarSchema = z.union([
  EntradaHistorialSchema.transform((e) => [e]),
  z.array(EntradaHistorialSchema).min(1).max(500, 'Hasta 500 mensajes por vez.'),
])

export interface MensajeHistorial {
  id: string
  direccion: 'in' | 'out'
  texto: string
  ocurrido_at: string
  canal: (typeof CANALES_HISTORIAL)[number]
  registrado_por: string | null
  autor: string | null
}

type Fila = Omit<MensajeHistorial, 'autor'> & {
  integrante: { nombre: string } | { nombre: string }[] | null
}

export class HistorialManualRepository {
  // La tabla es nueva y todavía no está en los tipos generados.
  constructor(private readonly sb: SupabaseClient) {}

  async listar(leadId: string): Promise<MensajeHistorial[]> {
    const { data, error } = await this.sb
      .from('lead_historial_manual')
      .select('id, direccion, texto, ocurrido_at, canal, registrado_por, integrante:registrado_por (nombre)')
      .eq('lead_id', leadId)
      .order('ocurrido_at', { ascending: true })
      .limit(1000)
    if (error) throw new Error(error.message)
    return ((data ?? []) as Fila[]).map(({ integrante, ...fila }) => ({
      ...fila,
      autor: Array.isArray(integrante) ? (integrante[0]?.nombre ?? null) : (integrante?.nombre ?? null),
    }))
  }

  async anotar(leadId: string, registradoPor: string, entradas: EntradaHistorial[]): Promise<number> {
    const { error, count } = await this.sb.from('lead_historial_manual').insert(
      entradas.map((e) => ({
        lead_id: leadId,
        direccion: e.direccion,
        texto: e.texto,
        canal: e.canal,
        registrado_por: registradoPor,
        ...(e.ocurridoAt && { ocurrido_at: e.ocurridoAt }),
      })),
      { count: 'exact' },
    )
    if (error) throw new Error(error.message)
    return count ?? entradas.length
  }

  async borrar(leadId: string, id: string): Promise<boolean> {
    const { data, error } = await this.sb
      .from('lead_historial_manual')
      .delete()
      .eq('lead_id', leadId)
      .eq('id', id)
      .select('id')
    if (error) throw new Error(error.message)
    return (data ?? []).length > 0
  }
}
