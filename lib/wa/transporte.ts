/**
 * Por dónde salen los mensajes de WhatsApp del equipo.
 *
 * Hay dos caminos posibles y coexisten a propósito durante la transición:
 *
 * - `puente` (por defecto) — el CRM anota en `outreach_messages` y el
 *   `wa-bridge` del VPS pasa a buscar cada 10s. Es lo que funciona hoy en
 *   producción, y sigue siendo el default para que desplegar este código no
 *   cambie nada por sí solo.
 *
 * - `vex` — el CRM llama al agente por HTTPS con su token. Es el destino: un
 *   solo transporte, con el freno de baneo que el puente no tiene, y sin
 *   Chromium comiéndose la RAM del servidor.
 *
 * **Por qué un interruptor y no un reemplazo directo.** WhatsApp permite 4
 * dispositivos vinculados: si el puente y el agente están conectados a la vez
 * al mismo número, son dos sesiones automatizadas y eso duplica la huella. El
 * corte tiene que ser deliberado y en un momento elegido —levantar el nuevo,
 * verificar, recién después apagar el viejo—, no un efecto colateral de un
 * despliegue.
 *
 * Se elige con `WA_TRANSPORTE` en el entorno del CRM: `vex` o `puente`.
 *
 * **Sin la variable no se elige por defecto: se avisa.** Antes, no tenerla caía
 * a `puente` en silencio. Eso fue correcto mientras el puente existía —el punto
 * era que desplegar no cambiara nada solo—, pero el puente ya no corre, y un
 * default hacia algo muerto deja de ser prudencia y pasa a ser una trampa.
 *
 * Costó dos días averiguarlo: cuatro mensajes quedaron en `encolado` esperando
 * a un puente que nadie iba a levantar, sin UN error en ninguna parte, porque
 * nadie había fallado — simplemente nadie fue a buscarlos. Un mensaje que no
 * sale tiene que decirlo; el silencio se confunde con estar en camino.
 */
export type Transporte = 'puente' | 'vex'

/** Lo que dice el entorno, incluido que no diga nada. */
export type TransporteConfigurado = Transporte | 'sin_configurar'

export function transporteActivo(): TransporteConfigurado {
  const valor = process.env.WA_TRANSPORTE?.trim().toLowerCase()
  if (valor === 'vex') return 'vex'
  if (valor === 'puente') return 'puente'
  return 'sin_configurar'
}

/**
 * Por qué no se puede enviar, en palabras que sirvan a quien lo lea en pantalla
 * — no a quien escribió el código.
 */
export function explicarTransporteSinConfigurar(): string {
  const valor = process.env.WA_TRANSPORTE?.trim()
  return valor
    ? `WA_TRANSPORTE dice "${valor}", que no es un transporte válido. Tiene que ser "vex" o "puente".`
    : 'Falta WA_TRANSPORTE en el entorno del CRM. Sin esa variable no se sabe por dónde mandar el ' +
        'mensaje, y no se elige sola: el puente viejo ya no corre y creerlo vivo deja los mensajes ' +
        'encolados para siempre. Definila en "vex" para usar el agente.'
}

export interface ResultadoEnvio {
  ok: boolean
  /** Identificador con el que el transporte reconoce este envío. */
  referencia?: string | number
  error?: string
}

/**
 * Manda un mensaje a través del agente.
 *
 * Devuelve el error en vez de lanzar porque quien llama tiene que decidir si
 * reintenta por el otro camino o le avisa a la persona: un envío fallido no es
 * excepcional, es un caso de todos los días cuando el WhatsApp se cae.
 */
export async function enviarPorVex(
  telefono: string,
  texto: string,
  nombre?: string
): Promise<ResultadoEnvio> {
  const url = process.env.VEX_AGENT_URL?.replace(/\/+$/, '')
  const token = process.env.VEX_AGENT_TOKEN

  if (!url || !token) {
    return { ok: false, error: 'El agente no está configurado' }
  }

  try {
    const res = await fetch(`${url}/api/enviar`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ telefono, texto, nombre }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })

    const cuerpo = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      error?: string
      outboxId?: number
    }

    if (!res.ok || !cuerpo.ok) {
      return { ok: false, error: cuerpo.error ?? `el agente respondió ${res.status}` }
    }

    return { ok: true, referencia: cuerpo.outboxId }
  } catch (error: unknown) {
    console.error('[wa/transporte] el agente no respondió al enviar:', error)
    return { ok: false, error: 'El agente no responde' }
  }
}
