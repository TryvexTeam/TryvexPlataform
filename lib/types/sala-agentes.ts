import { z } from 'zod'

/**
 * Tipos de la Sala de Agentes — el espacio de Intelligence donde el equipo
 * reparte trabajo a los agentes, firma lo irreversible y revisa lo entregado.
 *
 * Se apoyan en el modelo que YA existe en la base, no en uno nuevo:
 *   · `agentes` (migración 024): identidad, color, token, último uso.
 *   · `tareas` + loop agéntico (migración 014): estados, latido, firma humana,
 *     `ejecutado_por` distinto de `validado_por`.
 *   · `tarea_evidencias` (014): la regla de oro — sin evidencia no hay entrega.
 *
 * Lo único que todavía no tiene respaldo en la base son las RUTINAS y el estado
 * de presencia por agente; van marcados abajo. Esta primera entrega es la capa
 * visual, así que se alimenta de `lib/vex/sala-ejemplo.ts`.
 */

/**
 * Cómo está el agente ahora mismo.
 *
 * `esperando_firma` no es un capricho de la vista: es el estado `bloqueada` del
 * loop cuando la tarea `requiere_firma_humana` y nadie firmó. Es el único
 * estado en que el trabajo está detenido esperando a una persona, y por eso se
 * muestra primero en la sala.
 *
 * `sin_latido` viene del par `last_seen_at` + `ttl_segundos`: el runner murió
 * con la tarea tomada y su encargo quedó huérfano.
 */
export const ESTADOS_AGENTE = ['trabajando', 'esperando_firma', 'en_reposo', 'sin_latido'] as const
export type EstadoAgente = (typeof ESTADOS_AGENTE)[number]

/** Estados del loop agéntico, tal cual el CHECK de la migración 014. */
export const ESTADOS_ENCARGO = [
  'sin_empezar',
  'en_curso',
  'bloqueada',
  'probada',
  'listo',
  'huerfana',
] as const
export type EstadoEncargo = (typeof ESTADOS_ENCARGO)[number]

/** Tipos de evidencia que acepta `tarea_evidencias`. */
export const TIPOS_EVIDENCIA = ['exit_code', 'screenshot', 'url', 'log', 'test'] as const
export type TipoEvidencia = (typeof TIPOS_EVIDENCIA)[number]

export const AgenteSalaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  /** Qué hace en el equipo, en una línea. Columna `descripcion` de `agentes`. */
  oficio: z.string(),
  /** Token de color del CRM (`--tx-accent`, `--tx-blue`…), no un hex suelto. */
  color: z.string(),
  estado: z.enum(ESTADOS_AGENTE),
  /** Qué está haciendo ahora, o qué fue lo último si está en reposo. */
  haciendo: z.string(),
  /** El humano a cuyo nombre trabaja hoy. La deuda que la sala hace visible. */
  humano: z.string().nullable(),
  encargosHoy: z.number(),
  /** Cuándo corre su próxima rutina, en texto de persona. */
  proximaRutina: z.string().nullable(),
})
export type AgenteSala = z.infer<typeof AgenteSalaSchema>

export const EvidenciaSchema = z.object({
  tipo: z.enum(TIPOS_EVIDENCIA),
  /** Resumen legible. El payload completo se abre aparte. */
  resumen: z.string(),
})
export type Evidencia = z.infer<typeof EvidenciaSchema>

export const EncargoSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  agenteId: z.string(),
  estado: z.enum(ESTADOS_ENCARGO),
  evidencias: z.array(EvidenciaSchema),
  /** Resultado objetivo del gate: `null` mientras no hay veredicto. */
  veredicto: z.enum(['pasa', 'falla']).nullable(),
  /** Quién lo pidió: una persona o una rutina. */
  pedidoPor: z.string(),
  /** Irreversible: no se ejecuta sin firma humana previa. */
  requiereFirma: z.boolean(),
  /** Por qué no se puede deshacer. Solo con `requiereFirma`. */
  porQueIrreversible: z.string().nullable(),
})
export type Encargo = z.infer<typeof EncargoSchema>

/**
 * Trabajo que ocurre sin que nadie esté presente: por reloj o por evento.
 *
 * ⚠️ Todavía no existe tabla `rutinas`. Es la primera pieza que habrá que
 * agregar a la base cuando esta pantalla deje de ser maqueta.
 */
export const RutinaSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  /** 'reloj' corre a una hora fija; 'evento' reacciona a algo del CRM. */
  disparo: z.enum(['reloj', 'evento']),
  cuando: z.string(),
  ultimaCorrida: z.string(),
  activa: z.boolean(),
})
export type Rutina = z.infer<typeof RutinaSchema>

/**
 * Una puerta real del CRM concedida a un agente.
 *
 * `ruta` apunta a los route handlers que ya existen bajo `/api/agentes/*`: no
 * son permisos abstractos, son las llaves que el agente usa de verdad.
 */
export const HerramientaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  ruta: z.string().nullable(),
  detalle: z.string(),
  concedida: z.boolean(),
  /** Si al usarla hace falta firma humana antes (envíos, deploys, cobros). */
  exigeFirma: z.boolean(),
})
export type Herramienta = z.infer<typeof HerramientaSchema>

/** Un paso de lo que el agente hizo: la transcripción, no tres puntitos. */
export const PasoSchema = z.object({
  orden: z.number(),
  texto: z.string(),
  duracion: z.string(),
  resultado: z.enum(['ok', 'aviso', 'error']),
})
export type Paso = z.infer<typeof PasoSchema>

/** Una entrada del hilo: lo que se dijo, lo que se hizo o cómo terminó. */
export type EntradaHilo =
  | {
      clase: 'mensaje'
      /**
       * `persona` es alguien del equipo encargándole algo al agente; `cliente`
       * es quien escribe desde fuera. Se distinguen porque en la conversación
       * con un lead los tres pueden aparecer: el cliente, el agente, y el
       * humano que toma el control a mitad del hilo.
       */
      de: 'persona' | 'agente' | 'cliente'
      autor: string
      hora: string
      texto: string
    }
  | { clase: 'pasos'; pasos: Paso[] }
  | {
      clase: 'veredicto'
      resultado: 'pasa' | 'falla'
      detalle: string
      evidencias: Evidencia[]
    }

/**
 * Una conversación con alguien de afuera: un lead, un cliente.
 *
 * Es lo que Forja llama `conversations`, con una diferencia: acá el hilo no
 * trae solo lo que se dijo, sino lo que el agente HIZO entremedio — los pasos y
 * el veredicto — porque revisar una conversación sin ver qué herramientas usó
 * obliga a irse a buscar un registro a otra parte.
 */
export interface ConversacionCliente {
  id: string
  /** Quién escribe desde fuera. */
  cliente: string
  telefono: string
  canal: 'whatsapp' | 'web' | 'instagram'
  /** Qué agente la atiende. */
  agenteId: string
  /** `HUMANO` significa que alguien del equipo tomó el control de este hilo. */
  modo: ModoHilo
  ultimoMensaje: string
  hace: string
  sinLeer: number
  hilo: EntradaHilo[]
  /** La ficha, para no tener que abrir el CRM en otra pestaña. */
  ficha: {
    negocio: string
    rubro: string
    comuna: string
    estado: string
    /** Lo que su web ya resuelve, de `fact_leads.web_capacidades`. */
    capacidadesWeb: string[]
  }
}

export const MODOS_HILO = ['AI', 'HUMANO'] as const
export type ModoHilo = (typeof MODOS_HILO)[number]
