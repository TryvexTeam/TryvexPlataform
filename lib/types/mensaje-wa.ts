/**
 * Mensaje de WhatsApp asociado a un lead (tabla `mensajes_wa`).
 *
 * La tabla existe en la base (migración 013) pero todavía no está en
 * `database.ts` generado, por eso se define el tipo aquí a mano. Cuando se
 * regeneren los tipos o se mergee el repo `lib/repos/mensajes-wa.ts`, este
 * archivo puede reemplazarse por el tipo generado.
 *
 * `enviado_por` y `estado_envio` llegan con la migración 015 (pendiente de OK);
 * por eso son opcionales/nullables y la UI no debe asumir que existen.
 */
export type DireccionWa = 'in' | 'out'

export interface MensajeWa {
  id: string
  lead_id: string | null
  direccion: DireccionWa | string
  texto: string
  es_bot: boolean
  enviado_por: string | null
  estado_envio: string | null
  wa_message_id: string | null
  created_at: string
}
