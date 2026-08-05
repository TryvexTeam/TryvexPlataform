import { z } from 'zod'

/**
 * Lo que un agente puede mandar a `POST /api/agentes/mensajes`.
 *
 * `origen_ref` es la llave de idempotencia (migración 031): si viene, reingestar el
 * mismo mensaje no lo duplica. Formato `<fuente>:<id>` — por ejemplo `discord:1401…`.
 *
 * `created_at` sirve para migrar historial: sin él, todo #chatia entraría fechado hoy
 * y se perdería la cronología, que es justamente lo que hace útil el archivo.
 */
export const MensajeAgenteSchema = z.object({
  contenido: z.string().trim().min(1, 'El mensaje viene vacío').max(8000),
  origen_ref: z.string().trim().min(1).max(200).optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  /** Nombre del hilo destino. Por defecto, 'Equipo agéntico'. */
  hilo: z.string().trim().min(1).optional(),
})

export type MensajeAgenteInput = z.infer<typeof MensajeAgenteSchema>

/**
 * Ingesta en lote. El tope de 200 acota el tamaño del request y deja el backfill
 * troceado en pedazos reintentables: si uno falla, se repite solo ese.
 */
export const LoteMensajesAgenteSchema = z.object({
  mensajes: z.array(MensajeAgenteSchema).min(1).max(200),
  hilo: z.string().trim().min(1).optional(),
})

export type LoteMensajesAgente = z.infer<typeof LoteMensajesAgenteSchema>

export type ResultadoIngesta = {
  insertados: number
  duplicados: number
  ids: string[]
}
