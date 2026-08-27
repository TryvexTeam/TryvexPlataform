/**
 * Cliente del agente de WhatsApp (repo `Vex-Agente`).
 *
 * El CRM es la única interfaz del equipo: el panel propio del agente queda como
 * respaldo técnico. Este módulo es el puente — traduce lo que el agente expone
 * por HTTP a tipos que la vista de Tryvex Intelligence consume.
 *
 * SOLO servidor: usa `VEX_AGENT_TOKEN`, que viaja en la cabecera `Authorization`
 * y nunca llega al navegador. Las rutas del CRM que lo usan comprueban antes que
 * quien llama sea un integrante activo.
 */

/** Ajustes del agente que se pueden leer y escribir en caliente. */
export interface AjustesAgente {
  /** Modelo del LLM que responde. */
  model: string
  /** 0 a 1.5. Más alto, más suelto. */
  temperature: string
  /** '1' silencia al agente por completo. */
  paused: string
  /** Segundos que espera por si el lead sigue escribiendo. */
  buffer_seconds: string
  /** '1' transcribe las notas de voz. */
  audio_enabled: string
  transcription_model: string
  /** '1' interpreta las imágenes que mandan. */
  vision_enabled: string
  vision_model: string
  /** Horas de silencio antes del único toque de seguimiento. '0' lo apaga. */
  seguimiento_horas: string
}

export type ClaveAjuste = keyof AjustesAgente

export interface RespuestaAjustes {
  settings: AjustesAgente
  defaults: AjustesAgente
}

export type ModoConversacion = 'AI' | 'HUMAN'

export interface ConversacionAgente {
  id: number
  phone: string
  name: string | null
  mode: ModoConversacion
  last_message_at: number | null
  created_at: number
}

export interface MensajeAgente {
  id: number
  role: 'user' | 'assistant' | 'human'
  content: string
  created_at: number
}

export interface DiaAnalytics {
  day: string
  convos: number
  userMsgs: number
  botMsgs: number
  leads: number
  costUsd: number
}

export interface AnalyticsAgente {
  rangeDays: number
  days?: DiaAnalytics[]
  dudas?: Array<{ texto: string; veces: number }>
  [clave: string]: unknown
}

/** Un fallo hablando con el agente. Nunca lleva el token en el mensaje. */
export class ErrorAgente extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly ruta: string
  ) {
    super(message)
    this.name = 'ErrorAgente'
  }
}

const TIEMPO_LIMITE_MS = 10_000

export function agenteConfigurado(): boolean {
  return Boolean(process.env.VEX_AGENT_URL && process.env.VEX_AGENT_TOKEN)
}

/**
 * Llama al agente y devuelve el JSON tipado.
 *
 * Lanza `ErrorAgente` en vez de devolver `null` a propósito: quien llama tiene
 * que decidir qué mostrar, y un `null` silencioso convierte un agente caído en
 * una pantalla vacía sin explicación.
 */
async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const url = process.env.VEX_AGENT_URL?.replace(/\/+$/, '')
  const token = process.env.VEX_AGENT_TOKEN

  if (!url || !token) {
    throw new ErrorAgente('El agente no está configurado', 503, ruta)
  }

  let res: Response
  try {
    res = await fetch(`${url}${ruta}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: 'no-store',
    })
  } catch (error: unknown) {
    console.error(`[vex/agente] ${ruta} no respondió:`, error)
    throw new ErrorAgente('El agente no responde', 504, ruta)
  }

  if (!res.ok) {
    // El cuerpo del error del agente puede traer detalle útil, pero también
    // puede ser HTML de un proxy intermedio: se acota para no volcar una página
    // entera en los logs.
    const detalle = await res.text().catch(() => '')
    throw new ErrorAgente(
      mensajePara(res.status, detalle.slice(0, 200)),
      res.status,
      ruta
    )
  }

  return (await res.json()) as T
}

function mensajePara(status: number, detalle: string): string {
  if (status === 401 || status === 403) {
    return 'El agente rechazó la credencial: VEX_AGENT_TOKEN no coincide con el suyo'
  }
  if (status === 503) {
    return 'El agente corre sin sus credenciales de panel y se cerró solo'
  }
  return detalle || `El agente respondió ${status}`
}

export function obtenerAjustes(): Promise<RespuestaAjustes> {
  return pedir<RespuestaAjustes>('/api/settings')
}

/**
 * Cambia un ajuste. El agente valida y acota el valor, y devuelve cómo quedó:
 * se usa esa respuesta y no lo enviado, porque puede no ser lo mismo.
 */
export function guardarAjuste(key: ClaveAjuste, value: string): Promise<{ ok: boolean; settings: AjustesAgente }> {
  return pedir<{ ok: boolean; settings: AjustesAgente }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  })
}

export async function obtenerConversaciones(): Promise<ConversacionAgente[]> {
  const { conversations } = await pedir<{ conversations: ConversacionAgente[] }>('/api/conversations')
  return conversations
}

export async function obtenerMensajes(conversationId: number): Promise<MensajeAgente[]> {
  const { messages } = await pedir<{ messages: MensajeAgente[] }>(`/api/messages/${conversationId}`)
  return messages
}

export function obtenerAnalytics(dias = 7): Promise<AnalyticsAgente> {
  return pedir<AnalyticsAgente>(`/api/analytics?days=${dias}`)
}

/** Pasa una conversación a manos humanas, o se la devuelve al agente. */
export function cambiarModo(conversationId: number, mode: ModoConversacion): Promise<{ ok: boolean }> {
  return pedir<{ ok: boolean }>(`/api/mode/${conversationId}`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
}
