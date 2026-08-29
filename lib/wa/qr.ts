/** Estado de la vinculación del número de WhatsApp del equipo. */
export type EstadoQr =
  | 'no_configurado'
  | 'conectado'
  | 'esperando_qr'
  | 'qr_listo'
  | 'posible_baneo'
  | 'sin_respuesta'
  | 'token_invalido'
  /**
   * El agente dice estar vinculado pero hace rato que no da señales de vida.
   *
   * Distinto de `sin_respuesta`: ahí el agente ni contesta. Acá contesta, y lo
   * que responde es que su última confirmación es vieja — típicamente el socket
   * de WhatsApp se cayó y quedó reintentando sin lograrlo.
   *
   * Merece estado propio porque la reacción es OTRA: NO hay que reescanear
   * nada. La vinculación está bien; lo que falla es la salida a internet. Sin
   * esto, `sin_latido` caía en el caso por defecto, se mostraba un QR, y el
   * equipo terminaba desvinculando un número que estaba perfecto.
   */
  | 'sin_latido'

export interface ResultadoQr {
  estado: EstadoQr
  /** Data URL de la imagen del QR. Solo presente con estado `qr_listo`. */
  imagen?: string
  /** Número vinculado, cuando el agente lo conoce. */
  telefono?: string
  /** Segundos sin señal del agente. Solo con estado `sin_latido`. */
  sinLatidoHace?: number
}

/** Lo que devuelve `GET /api/connection/status` del agente. */
interface RespuestaAgente {
  status?: string
  qrPng?: string
  phone?: string | null
  /** Segundos desde el último latido. Solo viene con `sin_latido`. */
  sinLatidoHace?: number
}

/**
 * Cómo se llama cada estado del agente acá. Fuera de este mapa, cualquier
 * estado desconocido cae en `esperando_qr`: el QR se regenera cada ~20s, así
 * que esperar es la reacción correcta ante algo que no reconocemos.
 */
const ESTADOS: Record<string, EstadoQr> = {
  connected: 'conectado',
  qr: 'qr_listo',
  posible_baneo: 'posible_baneo',
  connecting: 'esperando_qr',
  disconnected: 'esperando_qr',
  sin_latido: 'sin_latido',
}

const TIEMPO_LIMITE_MS = 10_000

/**
 * Consulta el estado de vinculación al agente de WhatsApp (repo `Vex-Agente`).
 *
 * Vive acá (y no en el route handler) porque la usan dos consumidores: la página
 * de ajustes, que la llama en el servidor para pintar el QR sin esperar un
 * round-trip del cliente, y `/api/wa/qr`, que la sirve para el refresco.
 *
 * SOLO servidor: usa `VEX_AGENT_TOKEN`, que viaja en la cabecera `Authorization`
 * y nunca llega al navegador. Antes esto apuntaba al `wa-bridge` y le mandaba el
 * token por query param, lo que lo dejaba escrito en cualquier log de acceso
 * intermedio; una cabecera no queda registrada así.
 */
export async function obtenerEstadoQr(): Promise<ResultadoQr> {
  const urlAgente = process.env.VEX_AGENT_URL?.replace(/\/+$/, '')
  const token = process.env.VEX_AGENT_TOKEN

  if (!urlAgente || !token) return { estado: 'no_configurado' }

  try {
    const res = await fetch(`${urlAgente}/api/connection/status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: 'no-store',
    })

    // 401/403: el agente está vivo pero no acepta nuestro token.
    if (res.status === 401 || res.status === 403) return { estado: 'token_invalido' }
    // 503: el agente corre sin sus credenciales de panel y se cerró solo.
    if (res.status === 503) return { estado: 'token_invalido' }
    if (!res.ok) return { estado: 'sin_respuesta' }

    const datos = (await res.json()) as RespuestaAgente
    const estado = ESTADOS[datos.status ?? ''] ?? 'esperando_qr'
    const telefono = datos.phone ?? undefined

    // Un `qr_listo` sin imagen no es mostrable: se degrada a espera en vez de
    // dejar la pantalla anunciando un QR que no existe.
    if (estado === 'qr_listo') {
      return datos.qrPng
        ? { estado, imagen: datos.qrPng, telefono }
        : { estado: 'esperando_qr', telefono }
    }

    // El "hace cuánto" viaja hasta la pantalla: "sin señal" a secas no deja
    // distinguir un parpadeo de una caída de tres horas, y es justo esa
    // diferencia la que dice si hay que ir a mirar el proxy.
    if (estado === 'sin_latido') {
      return { estado, telefono, sinLatidoHace: datos.sinLatidoHace }
    }

    return { estado, telefono }
  } catch (error: unknown) {
    console.error('[wa/qr] el agente de WhatsApp no respondió:', error)
    return { estado: 'sin_respuesta' }
  }
}
