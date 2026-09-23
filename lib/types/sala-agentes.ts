import { z } from 'zod'
import { ESTADOS_OFICINA } from '@/lib/agentes/estado-oficina'

/**
 * Tipos de la Sala de Agentes — el espacio de Intelligence donde el equipo
 * reparte trabajo a los agentes, da permiso para lo que se ejecuta y revisa lo
 * entregado.
 *
 * De dónde sale cada cosa (verificado contra la base el 22-sep-2026):
 *   · `agentes`: identidad, color, dueño, llave, y `ultimo_uso_at`, que es el
 *     latido del que se deriva el estado.
 *   · `agente_encargos`: la cola de trabajo. Nace esperando permiso.
 *   · `mensajes_wa` + `fact_leads`: conversaciones y traspasos, derivados.
 *   · `agente_consumo`, `agente_citas`, `agente_rutinas`, `campanas`, `mejoras`:
 *     lo que reportan los agentes por `/api/agentes/*`.
 *
 * Ojo con una suposición vieja: la migración 014 del "loop agéntico"
 * (`tareas.ejecutado_por`, `tarea_evidencias`) NO está aplicada en esta base.
 * Las evidencias de un encargo todavía no tienen tabla; por eso `Encargo.evidencias`
 * llega vacío en vez de inventarse.
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

export const ActividadAgenteSchema = z.object({
  herramienta: z.string().nullable(),
  herramientaAt: z.string().nullable(),
  turnoDesde: z.string().nullable(),
  herramientasTurno: z.number(),
})
export type ActividadAgente = z.infer<typeof ActividadAgenteSchema>

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
  /** Lo que muestra la oficina 3D (lib/agentes/estado-oficina.ts). */
  oficina: z.object({
    estado: z.enum(ESTADOS_OFICINA),
    nota: z.string().nullable(),
    fuente: z.enum(['encargo', 'permiso', 'declarado', 'latido', 'desactivado']),
    venceAt: z.string().nullable(),
  }),
  /** El color tal cual está en la base (hex). La escena 3D no entiende tokens CSS. */
  colorHex: z.string(),
  /** Qué hace en este momento, según el hook de Claude Code (tabla agente_actividad). */
  actividad: ActividadAgenteSchema.nullable(),
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
  /** De quién es. Sin esto, cada agente mostraba las rutinas de todos. */
  agenteId: z.string(),
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

/**
 * Por dónde entra y sale el trabajo de los agentes.
 *
 * Lo que Forja llama `conexiones`. La diferencia es que acá cada canal declara
 * su RIESGO y sus plazos, porque no son equivalentes: WhatsApp por Baileys
 * puede perder el número para siempre, la API oficial cobra por mensaje, e
 * Instagram cierra la puerta a las 24 horas. Un panel que los muestra a todos
 * como "conectado / desconectado" esconde justo lo que decide el negocio.
 */
export const TIPOS_CANAL = [
  'whatsapp_baileys',
  'whatsapp_oficial',
  'web',
  'instagram',
  'telegram',
  'correo',
] as const
export type TipoCanal = (typeof TIPOS_CANAL)[number]

export const ESTADOS_CANAL = [
  'conectado',
  'sin_latido',
  'esperando_qr',
  'bloqueado',
  'apagado',
] as const
export type EstadoCanal = (typeof ESTADOS_CANAL)[number]

export interface Canal {
  id: string
  tipo: TipoCanal
  /** El número, el dominio o la cuenta. Lo que identifica este canal. */
  etiqueta: string
  agenteId: string
  estado: EstadoCanal
  desde: string
  /**
   * Qué se juega este canal si algo sale mal.
   * `alto` = se puede perder el número sin apelación (Baileys).
   */
  riesgo: 'ninguno' | 'medio' | 'alto'
  nota: string
  mensajesHoy: number
  /** Solo en Baileys: por dónde sale a internet. Dos números no comparten IP. */
  salida?: string
  /** Un plazo que corre y que alguien tiene que atender antes de que venza. */
  aviso?: {
    texto: string
    cuando: string
    severidad: 'info' | 'aviso' | 'critico'
  }
}

/**
 * Un traspaso: el momento en que un agente deja de poder y entra una persona.
 *
 * Forja llama a esto "tickets" y los ordena por fecha. Ordenarlos por fecha es
 * exactamente lo que no sirve: el que lleva más tiempo esperando no es el más
 * urgente. Acá cada traspaso declara POR QUÉ se soltó y QUÉ SE INTENTÓ antes,
 * porque las dos cosas deciden quién lo toma y con cuánta prisa.
 *
 * `motivo` no es texto libre a propósito: si no está en la lista, es un motivo
 * que nadie midió, y un motivo que nadie mide no se puede arreglar.
 */
export const MOTIVOS_TRASPASO = [
  // Los dos primeros se DERIVAN de los mensajes reales, sin que nadie los
  // anote: un cliente al que nadie contestó, y una persona que tomó el control
  // de algo que atendía el bot. Los demás los tiene que declarar el agente al
  // soltar la conversación; mientras no lo haga, no se adivinan.
  'sin_respuesta',
  'tomado_por_humano',
  'pidio_humano',
  'fuera_de_guion',
  'precio_no_autorizado',
  'reclamo',
  'dato_sensible',
  'sin_conocimiento',
  'tres_intentos',
] as const
export type MotivoTraspaso = (typeof MOTIVOS_TRASPASO)[number]

export type EstadoTraspaso = 'esperando' | 'tomado' | 'devuelto' | 'cerrado'

export interface Traspaso {
  id: string
  /** La conversación de la que viene, para poder abrirla. */
  conversacionId: string
  cliente: string
  canal: TipoCanal
  /** Quién lo soltó. */
  agenteId: string
  motivo: MotivoTraspaso
  /** Lo que hay que saber para retomar sin leer todo el hilo. */
  resumen: string
  /** Lo último que dijo el cliente, literal. */
  ultimoMensaje: string
  estado: EstadoTraspaso
  /** Desde cuándo espera, en ISO. */
  desde: string
  /** Quién lo tomó, si alguien lo tomó. */
  tomadoPor?: string
  /** Lo que el agente ya probó, para no repetirlo. */
  intentos: string[]
  /** Si el cliente está esperando una respuesta en este momento. */
  clienteEsperando: boolean
}
