import { z } from 'zod'

export const AGENTES_ENVIADOR = ['JARVIS', 'ARIEL', 'SPIKE'] as const
export type AgenteEnviador = (typeof AGENTES_ENVIADOR)[number]

export const MensajeWaSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid().nullable(),
  cliente_id: z.string().uuid().nullable(),
  direccion: z.enum(['in', 'out']),
  texto: z.string(),
  wa_message_id: z.string().nullable(),
  chip_id: z.string().nullable(),
  es_bot: z.boolean(),
  enviado_por: z.string().nullable(),
  // `pendiente` = salió de nuestras manos, WhatsApp no acusó recibo todavía.
  // Es el estado que faltaba: sin él había que elegir entre afirmar una entrega
  // que nadie confirmó o no decir nada.
  estado_envio: z.enum(['pendiente', 'enviado', 'entregado', 'leido', 'fallido']).nullable(),
  ack_codigo: z.string().nullable().optional(),
  ack_at: z.string().nullable().optional(),
  created_at: z.string(),
})

export type MensajeWa = z.infer<typeof MensajeWaSchema>

export const MensajeWaSalienteInsertSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  texto: z.string().min(1),
  chip_id: z.string().nullable().optional(),
  es_bot: z.boolean().default(false),
  enviado_por: z.enum(AGENTES_ENVIADOR).or(z.string().min(1)),
})

export type MensajeWaSalienteInsert = z.infer<typeof MensajeWaSalienteInsertSchema>
