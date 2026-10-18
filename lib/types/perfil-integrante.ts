/**
 * El perfil de un integrante: lo que hizo en Tryvex, a la vista de todo el equipo.
 *
 * Reglas que vienen de Cristian (18-oct) y que estos tipos cargan:
 * - Solo trabajo de Tryvex. Nada de proyectos personales ni de afuera.
 * - Un número es `number` cuando se pudo contar (0 incluido: es un 0 de verdad) y
 *   `null` cuando falta la fuente. La pantalla muestra "falta" en vez de un cero
 *   inventado: un cero mal contado le dice a alguien que no trabajó.
 * - "Contactó un lead" = le escribió o lo llamó al menos una vez.
 * - "Ganó un cliente" = un lead que contactó ya es cliente en el sistema.
 */

/** Lo que el integrante cuenta de sí mismo, desde su configuración. */
export interface DatosIntegrante {
  id: string
  nombre: string
  avatarUrl: string | null
  color: string | null
  rol: string | null
  especialidad: string | null
  bio: string | null
  linkedin: string | null
  portfolio: string | null
  email: string
  activo: boolean
  /** Desde cuándo está en el CRM. */
  desde: string
}

export interface NumerosIntegrante {
  /** Horas de jornada en los últimos 12 meses. `null` si no se pudieron leer. */
  horas: number | null
  leadsContactados: number | null
  clientesGanados: number | null
  tareasCompletadas: number | null
  proyectos: number | null
}

/** Un día del calendario de actividad (los cuadros verdes). */
export interface DiaActividad {
  /** YYYY-MM-DD en hora de Chile. */
  fecha: string
  /** Suma de todo lo que hizo ese día; de esto sale el tono del cuadro. */
  total: number
  leads: number
  tareas: number
  mensajes: number
  horas: number
}

export type TipoMovimiento = 'lead' | 'tarea' | 'cliente' | 'proyecto'

/** Una línea de "actividad reciente". */
export interface MovimientoIntegrante {
  tipo: TipoMovimiento
  texto: string
  fecha: string
  href: string | null
}

export interface ProyectoDelIntegrante {
  id: string
  nombre: string
  estado: string
  esResponsable: boolean
}

/** El asistente de IA que trabaja a nombre del integrante (Jarvis, Goku…). */
export interface AsistenteDelIntegrante {
  id: string
  nombre: string
  descripcion: string | null
  color: string | null
  activo: boolean
  ultimoUsoAt: string | null
  encargosRespondidos: number
  encargosAbiertos: number
}

export interface PerfilIntegrante {
  datos: DatosIntegrante
  numeros: NumerosIntegrante
  calendario: DiaActividad[]
  /** Días seguidos con actividad, contando hasta hoy (o ayer si hoy aún no hay nada). */
  racha: number
  recientes: MovimientoIntegrante[]
  proyectos: ProyectoDelIntegrante[]
  /** `null` = no se pudo leer (distinto de "no tiene asistente"). */
  asistentes: AsistenteDelIntegrante[] | null
}
