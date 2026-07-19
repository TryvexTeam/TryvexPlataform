/** Estado de la vinculación del número de WhatsApp del equipo. */
export type EstadoQr =
  | 'no_configurado'
  | 'conectado'
  | 'esperando_qr'
  | 'qr_listo'
  | 'sin_respuesta'
  | 'token_invalido'

export interface ResultadoQr {
  estado: EstadoQr
  /** Data URL de la imagen del QR. Solo presente con estado `qr_listo`. */
  imagen?: string
}

const procEnv = process['env']

/**
 * Consulta el `GET /qr` del wa-bridge y traduce su HTML a un estado tipado.
 *
 * Vive acá (y no en el route handler) porque la usan dos consumidores: la página
 * de ajustes, que la llama en el servidor para pintar el QR sin esperar un
 * round-trip del cliente, y `/api/wa/qr`, que la sirve para el refresco.
 *
 * SOLO servidor: usa `WA_BRIDGE_QR_TOKEN`. El bridge recibe ese token por query
 * param (lo abre un navegador humano, no un fetch con headers), así que si
 * compartiéramos la URL directa el token quedaría en el historial del navegador
 * y en el chat donde se coordina el escaneo. Acá nunca sale del servidor.
 */
export async function obtenerEstadoQr(): Promise<ResultadoQr> {
  const bridgeUrl = procEnv.WA_BRIDGE_URL
  const qrToken = procEnv.WA_BRIDGE_QR_TOKEN

  if (!bridgeUrl || !qrToken) return { estado: 'no_configurado' }

  try {
    const res = await fetch(`${bridgeUrl}/qr?token=${encodeURIComponent(qrToken)}`, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    })

    if (res.status === 401) return { estado: 'token_invalido' }
    // 503 = el bridge arrancó pero WhatsApp todavía no emitió el QR.
    if (res.status === 503) return { estado: 'esperando_qr' }

    const html = await res.text()
    if (html.includes('Sesion ya conectada')) return { estado: 'conectado' }

    // El bridge sirve HTML porque está pensado para abrirse directo en el
    // navegador. Si el markup cambia y no matchea, se reporta `esperando_qr` en
    // vez de romper: el QR se regenera solo cada 20s.
    const match = html.match(/src="(data:image\/[a-z+]+;base64,[^"]+)"/i)
    if (!match) return { estado: 'esperando_qr' }

    return { estado: 'qr_listo', imagen: match[1] }
  } catch (error: unknown) {
    console.error('[wa/qr] wa-bridge no respondió:', error)
    return { estado: 'sin_respuesta' }
  }
}
