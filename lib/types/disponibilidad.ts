import { z } from 'zod'

/** Celda de 1 hora: dia_semana 0=lunes ... 6=domingo · hora 0-23 */
export const CeldaSchema = z.object({
  dia_semana: z.number().int().min(0).max(6),
  hora: z.number().int().min(0).max(23),
})

export const DisponibilidadPutSchema = z.object({
  celdas: z.array(CeldaSchema).max(168),
})

export type Celda = z.infer<typeof CeldaSchema>

export interface DisponibilidadIntegrante {
  integrante_id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  es_propio: boolean
  celdas: Celda[]
}

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/* ─── Disponibilidad pública (formulario de citas de la landing) ─────────── */

/** Duración de la llamada de descubrimiento. Igual que en la landing. */
export const DURACION_CITA_MIN = 20

/** Minutos dentro de la hora en que empieza un slot. Una celda de 1h da dos. */
export const MINUTOS_DE_SLOT = [0, 30] as const

/** Cuánto antes de la cita se deja de poder reservar. */
export const ANTICIPACION_MINIMA_HORAS = 2

/** Días hacia adelante que se ofrecen. Horizonte corto a propósito: ver abajo. */
export const HORIZONTE_DIAS_MAX = 14

/**
 * Un hueco reservable, **sin identidad**.
 *
 * Deliberadamente no lleva quién atiende, ni cuántas personas hay libres.
 * Publicar los huecos publica, por diferencia, lo ocupado: alguien que consulte
 * este endpoint cada hora durante dos semanas reconstruye en qué horas trabaja
 * realmente cada integrante, cuándo tiene reuniones, cuántas y de qué duración,
 * y qué días no hay nadie. Con nombre y foto, si los devolviéramos.
 *
 * Un contador ("quedan 2 de 3") filtra lo mismo más despacio, así que tampoco
 * va. La persona que atiende se asigna en el servidor al confirmar la reserva y
 * el visitante se entera en el correo de confirmación.
 */
export const SlotPublicoSchema = z.object({
  /** `YYYY-MM-DD` en zona America/Santiago. */
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** `HH:MM` local de Santiago. */
  hora: z.string().regex(/^\d{2}:\d{2}$/),
})

export type SlotPublico = z.infer<typeof SlotPublicoSchema>

/** Parámetros del endpoint público. `dias` acotado para limitar el muestreo. */
export const SlotsPublicosQuerySchema = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dias: z.coerce.number().int().min(1).max(HORIZONTE_DIAS_MAX).default(HORIZONTE_DIAS_MAX),
})
