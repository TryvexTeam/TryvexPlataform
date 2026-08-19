/**
 * Definición declarativa de los KPIs del Panel de Mando (T-003 §5).
 *
 * Módulo TS, no componente: la página y el deck consultan aquí etiquetas,
 * permisos y rutas en vez de duplicarlas. Nada de esto renderiza.
 */

export type PersonaKpi = 'personal' | 'equipo'

/** Forma visual con la que se pinta el KPI en el bento. */
export type FormaKpi = 'numero' | 'barras' | 'sparkline' | 'agenda'

export interface KpiDef {
  id: string
  label: string
  persona: PersonaKpi
  /** Permiso que exige este KPI; null = siempre visible. */
  permiso: string | null
  forma: FormaKpi
  /** Ruta real de la sección donde se resuelve. */
  href: string
}

/** Los 6 KPIs personales de T-003 §5 (fase 5.2). */
export const KPIS_PERSONALES: KpiDef[] = [
  {
    id: 'leads-sin-contactar',
    label: 'Leads sin contactar',
    persona: 'personal',
    permiso: null,
    forma: 'numero',
    href: '/leads?estado=sin_contactar',
  },
  {
    id: 'tareas-vencidas',
    label: 'Tareas vencidas',
    persona: 'personal',
    permiso: null,
    forma: 'numero',
    href: '/tareas',
  },
  {
    id: 'carga-trabajo',
    label: 'Carga de trabajo',
    persona: 'personal',
    permiso: null,
    forma: 'barras',
    href: '/tareas',
  },
  {
    id: 'interacciones-semana',
    label: 'Interacciones esta semana',
    persona: 'personal',
    permiso: null,
    forma: 'sparkline',
    href: '/leads',
  },
  {
    id: 'horas-semana',
    label: 'Horas esta semana',
    persona: 'personal',
    permiso: null,
    forma: 'numero',
    href: '/jornada',
  },
  {
    id: 'proximas-citas',
    label: 'Próximas citas',
    persona: 'personal',
    permiso: null,
    forma: 'agenda',
    href: '/reuniones',
  },
]

/** Lookup de un KPI personal por id. */
export function kpiPersonal(id: string): KpiDef | undefined {
  return KPIS_PERSONALES.find((k) => k.id === id)
}
