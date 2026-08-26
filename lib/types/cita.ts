import { z } from 'zod'

/**
 * Reglas de la reserva pública, del lado del CRM.
 *
 * La landing valida lo mismo en `src/lib/validacion-agenda.ts`, y esa
 * duplicación es deliberada: son dos repos distintos, y este endpoint no puede
 * asumir que quien lo llama validó nada. El comentario de la landing lo dice
 * mejor que yo: "el criterio no es rechazar todo lo raro, es rechazar lo que
 * hace imposible devolver la llamada".
 *
 * Lo que NO se replica son los mensajes de error: los ve el visitante en la
 * landing, no acá. Acá solo importa aceptar o rechazar.
 */

/* Letras con tildes y ñ, espacios, apóstrofos, guiones y puntos. Sin dígitos:
   un nombre con un número no sirve para devolver una llamada. */
const LETRAS_NOMBRE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u

/* Los separadores que la gente escribe de verdad. La cuenta de dígitos va
   aparte, porque es lo que decide si el número se puede marcar. */
const CARACTERES_TELEFONO = /^[+()\d\s.-]+$/

const MIN_DIGITOS_TELEFONO = 8
const MAX_DIGITOS_TELEFONO = 15

export const ReservaCitaSchema = z.object({
  nombre: z.string().trim().min(2).max(80).regex(LETRAS_NOMBRE),
  email: z.string().trim().email().max(160),
  telefono: z
    .string()
    .trim()
    .max(30)
    .regex(CARACTERES_TELEFONO)
    .refine((t) => {
      const digitos = (t.match(/\d/g) ?? []).length
      return digitos >= MIN_DIGITOS_TELEFONO && digitos <= MAX_DIGITOS_TELEFONO
    }),
  mensaje: z.string().trim().max(2000).optional(),

  /** Instante de inicio en ISO 8601 con zona. La hora la fija el servidor al parsear. */
  inicio: z.string().datetime({ offset: true }),

  /**
   * Qué texto de consentimiento tenía delante la persona al pulsar el botón.
   * Sin esto la solicitud se rechaza: es lo que hace verificable el
   * "informado" que pide la Ley 21.719, y es el único dato del consentimiento
   * que puede venir del navegador — la hora, la IP y el agente los pone el
   * servidor, porque un dato que prueba una autorización no puede venir del
   * mismo lado que la declara.
   */
  consentimiento_version: z.string().trim().min(1).max(40),
})

export type ReservaCita = z.infer<typeof ReservaCitaSchema>

/** Lo que el CRM le devuelve a la landing para que arme sus correos. */
export interface ReservaConfirmada {
  evento_id: string
  lead_id: string
  /** Nombre de pila de quien atiende. La landing lo pone en el correo. */
  integrante_nombre: string
  meet_link: string | null
}

/** Cuántas reservas admite una misma IP por hora. */
export const MAX_RESERVAS_POR_IP_HORA = 3
