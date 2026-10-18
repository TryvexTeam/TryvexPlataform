/**
 * Qué muestra la oficina de Intelligence para cada agente.
 *
 * Mezcla tres fuentes, en este orden, porque no valen lo mismo:
 *
 *   1. Un encargo en curso. Es un hecho del CRM: si lo tiene tomado, trabaja,
 *      diga lo que diga.
 *   2. Algo esperando permiso. Es lo único que pide la acción de una persona,
 *      así que se muestra aunque el agente esté descansando.
 *   3. Lo que el agente declaró (por la API o el MCP), mientras no venza.
 *   4. Si no declaró nada vigente, su latido: conectado hace poco es que está
 *      disponible; sin señales, no está.
 *
 * El latido solo NUNCA dice "trabajando": un puente consulta la cola cada pocos
 * segundos sin estar haciendo nada, y eso no es trabajar.
 */

export const ESTADOS_OFICINA = ['trabajando', 'descansando', 'esperando_permiso', 'ausente'] as const
export type EstadoOficina = (typeof ESTADOS_OFICINA)[number]

export const ESTADOS_DECLARABLES = ['trabajando', 'descansando', 'ausente'] as const
export type EstadoDeclarable = (typeof ESTADOS_DECLARABLES)[number]

/** Sin ninguna señal por más de esto, el agente no está. */
export const MINUTOS_SIN_SENAL = 30

export interface EntradaOficina {
  activo: boolean
  ultimoUsoAt: string | null
  declarado: EstadoDeclarable | null
  declaradoHasta: string | null
  nota: string | null
  /** Título del encargo que tiene tomado, si tiene uno. */
  encargoEnCurso: string | null
  esperandoPermiso: boolean
  ahora: number
}

export interface SalidaOficina {
  estado: EstadoOficina
  /** Qué se escribe sobre el escritorio. */
  nota: string | null
  /** De dónde sale el estado, para poder explicarlo en la ficha. */
  fuente: 'encargo' | 'permiso' | 'declarado' | 'latido' | 'desactivado'
  /** Cuándo vence lo declarado: la oficina se recalcula sola en ese momento. */
  venceAt: string | null
}

export function estadoEnOficina(e: EntradaOficina): SalidaOficina {
  if (!e.activo) return { estado: 'ausente', nota: 'Desactivado', fuente: 'desactivado', venceAt: null }
  if (e.encargoEnCurso) return { estado: 'trabajando', nota: e.encargoEnCurso, fuente: 'encargo', venceAt: null }
  if (e.esperandoPermiso) {
    return { estado: 'esperando_permiso', nota: 'Esperando que alguien apruebe su encargo', fuente: 'permiso', venceAt: null }
  }

  const vigente = e.declarado && e.declaradoHasta && Date.parse(e.declaradoHasta) > e.ahora
  if (vigente) return { estado: e.declarado as EstadoDeclarable, nota: e.nota, fuente: 'declarado', venceAt: e.declaradoHasta }

  const minutos = e.ultimoUsoAt ? (e.ahora - Date.parse(e.ultimoUsoAt)) / 60_000 : Infinity
  return minutos <= MINUTOS_SIN_SENAL
    ? { estado: 'descansando', nota: 'Conectado, sin trabajo', fuente: 'latido', venceAt: null }
    : { estado: 'ausente', nota: null, fuente: 'latido', venceAt: null }
}
