/**
 * El enlace para escribirle a un lead desde el WhatsApp PROPIO de quien está
 * usando el CRM, con el mensaje ya escrito.
 *
 * En el teléfono se usa `wa.me`, que abre la app directo. En el computador se
 * va a `web.whatsapp.com/send`: `wa.me` en escritorio muestra primero una
 * página intermedia de WhatsApp preguntando cómo abrirlo, y ese clic de más
 * era justo lo que se quería evitar.
 */

export interface DispositivoNavegador {
  userAgent: string
  /** `navigator.userAgentData?.mobile`, donde existe (Chrome/Edge). */
  mobile?: boolean
  /** `navigator.maxTouchPoints`: el iPad moderno se presenta como Mac. */
  maxTouchPoints?: number
}

export function esTelefono(d: DispositivoNavegador): boolean {
  if (typeof d.mobile === 'boolean') return d.mobile
  if (/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(d.userAgent)) return true
  return /Macintosh/.test(d.userAgent) && (d.maxTouchPoints ?? 0) > 1
}

/** `numero` en dígitos con código de país (56987652232). */
export function enlaceWhatsapp(numero: string, texto: string, enTelefono: boolean): string {
  const t = encodeURIComponent(texto)
  return enTelefono
    ? `https://wa.me/${numero}?text=${t}`
    : `https://web.whatsapp.com/send?phone=${numero}&text=${t}`
}
