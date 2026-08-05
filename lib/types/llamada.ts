import { z } from 'zod'

export type EstadoLlamada = 'sonando' | 'en_curso' | 'terminada'
export type MotivoFin = 'colgada' | 'sin_respuesta' | 'rechazada' | 'abandonada'
export type EstadoParticipante = 'invitado' | 'en_llamada' | 'rechazo' | 'salio'

export type Llamada = {
  id: string
  conversacion_id: string
  iniciada_por: string
  estado: EstadoLlamada
  con_video: boolean
  created_at: string
  contestada_at: string | null
  terminada_at: string | null
  motivo_fin: MotivoFin | null
}

/** Resumen mensual de consumo. Ver la vista `llamadas_resumen_mes` (migración 037). */
export type ConsumoLlamadas = {
  llamadas: number
  segundos_totales: number
  segundos_relay: number
  sin_medir: number
  gb_estimados: number
}

export type ParticipanteLlamada = {
  llamada_id: string
  integrante_id: string
  estado: EstadoParticipante
  entro_at: string | null
  salio_at: string | null
  /** null = no se pudo medir. Ver el comentario de la migración 037. */
  via_relay?: boolean | null
  segundos?: number | null
}

export const IniciarLlamadaSchema = z.object({
  conversacion_id: z.string().uuid(),
  con_video: z.boolean().default(false),
})

/** Las cuatro cosas que le pueden pasar a una llamada desde el cliente. */
export const AccionLlamadaSchema = z.object({
  accion: z.enum(['entrar', 'rechazar', 'salir', 'terminar']),
  /**
   * Solo al salir. El navegador es el único que sabe por dónde fue el tráfico:
   * si la conexión quedó directa no consumió nada, y si pasó por relay salió de
   * la cuota de TURN. Sin este dato, Finanzas no puede decir si las llamadas
   * están costando algo.
   */
  via_relay: z.boolean().optional(),
  segundos: z.number().int().min(0).max(86400).optional(),
})

export type IniciarLlamadaInput = z.infer<typeof IniciarLlamadaSchema>
export type AccionLlamadaInput = z.infer<typeof AccionLlamadaSchema>

// ── Señalización ────────────────────────────────────────────────────────────
// Lo que viaja por el canal de broadcast. Nunca toca la base: una oferta SDP
// vence en segundos, guardarla sería guardar basura.

export type SenalLlamada =
  | { tipo: 'oferta'; de: string; para: string; sdp: RTCSessionDescriptionInit }
  | { tipo: 'respuesta'; de: string; para: string; sdp: RTCSessionDescriptionInit }
  | { tipo: 'ice'; de: string; para: string; candidato: RTCIceCandidateInit }
  /** "Estoy compartiendo pantalla" / "ya no": el otro lado no puede deducirlo del track. */
  | { tipo: 'pantalla'; de: string; activa: boolean }
  /** Micrófono o cámara apagados: el track sigue vivo pero mudo, hay que avisarlo. */
  | { tipo: 'estado'; de: string; micro: boolean; camara: boolean }

export const EVENTO_SENAL = 'senal'

export function canalLlamada(llamadaId: string): string {
  return `llamada-${llamadaId}`
}

// ── Calidad adaptativa ──────────────────────────────────────────────────────
/**
 * En una malla cada uno sube su video a todos los demás: con 5 personas son 4
 * subidas simultáneas. A 720p eso son ~6 Mbps de subida y la llamada se cae en
 * cualquier conexión doméstica. Bajar la resolución cuando entra gente es lo que
 * hace que la malla aguante los 5 del equipo sin un servidor de por medio.
 *
 * `maxBitrate` va en bits por segundo, que es lo que espera RTCRtpSender.
 */
export function perfilVideo(participantes: number): {
  ancho: number
  alto: number
  fps: number
  maxBitrate: number
} {
  if (participantes <= 2) return { ancho: 1280, alto: 720, fps: 30, maxBitrate: 1_500_000 }
  if (participantes === 3) return { ancho: 960, alto: 540, fps: 25, maxBitrate: 800_000 }
  if (participantes === 4) return { ancho: 640, alto: 360, fps: 20, maxBitrate: 500_000 }
  return { ancho: 480, alto: 270, fps: 15, maxBitrate: 300_000 }
}

/**
 * La pantalla compartida es al revés que la cámara: importa el detalle (se lee
 * código) y no importan los cuadros por segundo. Se le da más bitrate aunque
 * haya mucha gente, porque si no el texto queda ilegible y la función no sirve.
 */
export const BITRATE_PANTALLA = 2_500_000

/**
 * Quién le hace la oferta a quién. Sin una regla fija los dos ofrecen al mismo
 * tiempo, las dos negociaciones chocan ("glare") y la conexión no se levanta.
 * Comparar los UUID da un orden estable que ambos lados calculan igual sin
 * hablarlo.
 */
export function debeOfrecer(miId: string, otroId: string): boolean {
  return miId > otroId
}

export function duracionLegible(desde: string, hasta: string): string {
  const segundos = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 1000))
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  if (m === 0) return `${s} s`
  return `${m} min ${String(s).padStart(2, '0')} s`
}
