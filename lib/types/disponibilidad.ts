import { z } from 'zod'

/** Celda de 1 hora: dia_semana 0=lunes ... 6=domingo · hora 0-23 */
export const CeldaSchema = z.object({
  dia_semana: z.number().int().min(0).max(6),
  hora: z.number().int().min(0).max(23),
  /**
   * Si esta hora se ofrece como reservable en tryvex.tech (migración 090).
   *
   * Opcional para que un cliente viejo que mande celdas sin la bandera siga
   * funcionando; el RPC las guarda como privadas, que es el lado seguro:
   * publicar una hora tiene que ser un acto deliberado.
   */
  publica: z.boolean().optional(),
})

export const DisponibilidadPutSchema = z.object({
  celdas: z.array(CeldaSchema).max(168),
  /**
   * El interruptor maestro de la persona. Va en el mismo PUT que la grilla
   * porque es la misma decisión de una sola pantalla: guardar dos veces desde
   * dos endpoints deja el estado a medias si el segundo falla.
   */
  recibe_citas: z.boolean().optional(),
})

export type Celda = z.infer<typeof CeldaSchema>

export interface DisponibilidadIntegrante {
  integrante_id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  es_propio: boolean
  celdas: Celda[]
  /** Interruptor maestro: si ofrece sus horas para citas de la landing. */
  recibe_citas: boolean
  /**
   * Si la empresa lo publicó en tryvex.tech (044). Sin esto, encender
   * `recibe_citas` no tiene efecto — la pantalla lo explica en vez de ofrecer
   * un interruptor que no hace nada.
   */
  visible_en_landing: boolean
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
