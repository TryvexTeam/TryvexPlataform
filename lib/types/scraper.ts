import { z } from 'zod'

/**
 * Corridas del scraper de leads.
 *
 * Una fila cuenta la vida completa de una corrida: quien la pidio, con que
 * filtros, como va, y que trajo. Ver la migracion 040 para el por que de que
 * esto sea un buzon y no una llamada HTTP al VPS.
 */

export const ESTADOS_CORRIDA = ['encolada', 'corriendo', 'lista', 'fallida', 'frenada'] as const
export type EstadoCorrida = (typeof ESTADOS_CORRIDA)[number]

/** Una corrida sigue viva mientras el VPS pueda tocarla. */
export const ESTADOS_ACTIVOS: EstadoCorrida[] = ['encolada', 'corriendo']

export interface ScraperRun {
  id: string
  fecha: string
  estado: EstadoCorrida
  filtros: FiltrosScraper
  pedida_por: string | null
  categoria_actual: string | null
  categorias_totales: number | null
  categorias_hechas: number
  freno_pedido: boolean
  error: string | null
  iniciada_at: string | null
  terminada_at: string | null
  duracion_min: number | null
  nuevos_leads: number
  actualizados: number
  descartados: number
  total_procesados: number
}

/** La corrida, mas el nombre de quien la pidio (para mostrarlo en pantalla). */
export interface ScraperRunConAutor extends ScraperRun {
  pedida_por_nombre: string | null
}

/**
 * Lo que la persona elige en pantalla.
 *
 * Son los mismos flags que el scraper ya acepta por linea de comandos
 * (--nicho --comuna --cantidad). Ciudad, region, pais y zoom existen en el
 * scraper pero no se piden acá: tienen valores por defecto que sirven para
 * Chile y llenarian la pantalla de campos que nadie toca.
 *
 * `nicho` vacio = las 23 categorias de siempre, igual que la corrida automatica.
 */
export const FiltrosScraperSchema = z.object({
  nicho: z.string().trim().max(60).optional().or(z.literal('')),
  comuna: z.string().trim().max(80).optional().or(z.literal('')),
  // El tope no es capricho: cada resultado es una ficha de Google Maps que hay
  // que abrir, y el navegador del VPS tiene 3 GB. Mas de 100 por categoria y la
  // corrida se vuelve de horas.
  cantidad: z.coerce.number().int().min(5).max(100).optional(),
})

export type FiltrosScraper = z.infer<typeof FiltrosScraperSchema>

/** Como se lee un filtro vacio, para no mostrar "undefined" en pantalla. */
export function describirFiltros(f: FiltrosScraper): string {
  const partes: string[] = []
  partes.push(f.nicho ? f.nicho : 'todos los rubros')
  if (f.comuna) partes.push(f.comuna)
  if (f.cantidad) partes.push(`hasta ${f.cantidad} c/u`)
  return partes.join(' · ')
}
