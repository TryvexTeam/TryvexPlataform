/**
 * Tipos del Panel de Mando (PRP-008, fase 5.1).
 *
 * Viven aquí y no inline porque los comparten el Server Component (`page.tsx`,
 * que arma los datos) y los componentes cliente del deck.
 */

import type { Interaccion, Lead } from '@/lib/types/lead'

/** Las dos vistas del deck. Se persiste en la URL para que sea compartible (D6). */
export const VISTAS_DASHBOARD = ['loMio', 'equipo'] as const
export type VistaDashboard = (typeof VISTAS_DASHBOARD)[number]

/** Normaliza el search param `vista`: cualquier basura cae en 'loMio'. */
export function vistaDesdeParam(valor: string | null | undefined, veEquipo: boolean): VistaDashboard {
  if (valor === 'equipo' && veEquipo) return 'equipo'
  return 'loMio'
}

/** Tono de una alerta: define color y urgencia percibida. */
export type TonoAlerta = 'neutral' | 'alerta' | 'ok'

/** Una alerta accionable del primer viewport (número grande + destino real). */
export interface AlertaDash {
  id: string
  label: string
  valor: number
  /** Copy corto bajo el número. */
  detalle: string
  /** Ruta real de la sección donde se resuelve. */
  href: string
  tono: TonoAlerta
}

/** Datos ya agregados de una vista del deck. */
export interface DeckDatos {
  alertas: AlertaDash[]
  /** true si la consulta que alimenta esta vista falló: el deck pinta el error. */
  fallo: boolean
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bento personal (PRP-008, fase 5.2). Los KPIs 1 y 2 ya viven en `alertas`;
 * estos tipos alimentan las vitrinas nuevas: carga, interacciones y horas.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Un punto de una serie diaria: día 'YYYY-MM-DD' de Santiago + valor. */
export interface SerieDia {
  dia: string
  total: number
}

/** Tareas activas (no listas, no eliminadas) agrupadas por prioridad. */
export interface CargaPrioridades {
  alta: number
  media: number
  baja: number
}

/** KPI de interacciones de la semana: total + serie de 7 días para el sparkline. */
export interface InteraccionesSemana {
  total: number
  serie: SerieDia[]
}

/**
 * Datos del bento personal. Cada pieza en null significa que SU consulta
 * falló: la vitrina correspondiente pinta su estado de error, el resto
 * del bento sigue en pie.
 */
export interface BentoPersonalDatos {
  carga: CargaPrioridades | null
  interacciones: InteraccionesSemana | null
  horas: number | null
}

/* ────────────────────────────────────────────────────────────────────────────
 * "Requiere acción hoy" (T-012 §4): los leads del integrante que más hace
 * que nadie les escribe, con su estado y su última interacción.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Una fila de la tabla "Requiere acción hoy". */
export interface FilaAccionHoy {
  lead_id: string
  nombre_negocio: string
  localidad: string | null
  estado: Lead['estado']
  /** Días de Santiago desde el último contacto; null = nunca contactado. */
  dias_sin_contacto: number | null
  /** Tipo de la última interacción registrada; null = ninguna. */
  ultimo_tipo: Interaccion['tipo'] | null
  /** 'YYYY-MM-DD' de la última interacción; null = ninguna. */
  ultimo_dia: string | null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Marcador del equipo: quién lleva más horas, contactos y reuniones en la
 * semana. Es un marcador, no una tabla de posiciones — la diferencia está en
 * qué se muestra y qué se calla, y se explica en `marcador-equipo.tsx`.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lo que aporta una persona en una métrica de la semana. */
export interface AporteIntegrante {
  integranteId: string
  nombre: string
  valor: number
  /** Es el usuario que está mirando: se marca para orientarse, no para exponerlo. */
  esMio: boolean
}

/** Una métrica del marcador, ya ordenada de mayor a menor. */
export interface MetricaEquipo {
  id: 'horas' | 'contactos' | 'reuniones'
  label: string
  /** Unidad corta que acompaña al total ('h', 'contactos', 'reuniones'). */
  unidad: string
  /** Suma de todos los aportes: la meta es colectiva antes que individual. */
  total: number
  /** Solo quien tiene aporte > 0. Nadie figura con un cero público. */
  aportes: AporteIntegrante[]
  /** Cómo formatear valores decimales (las horas llevan un decimal). */
  decimales?: number
}
