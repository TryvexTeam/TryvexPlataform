import { z } from 'zod'

export const ENTIDADES = ['lead', 'cliente', 'proyecto', 'reunion', 'venta', 'equipo'] as const
export const FUENTES = [
  'whatsapp',
  'interaccion',
  'reunion',
  'venta',
  'estado',
  'nota',
  'scraper',
  'sistema',
] as const

export type EntidadTipo = (typeof ENTIDADES)[number]
export type FuenteEntrada = (typeof FUENTES)[number]

export const CrearNotaSchema = z.object({
  entidad_tipo: z.enum(ENTIDADES),
  entidad_id: z.string().uuid().nullable().optional(),
  titulo: z.string().trim().min(1, 'La nota necesita un título').max(160),
  contenido: z.string().trim().max(8000).optional(),
})

export const FiltroBitacoraSchema = z.object({
  entidad_tipo: z.enum(ENTIDADES).optional(),
  entidad_id: z.string().uuid().optional(),
  fuente: z.enum(FUENTES).optional(),
  buscar: z.string().trim().min(2).max(120).optional(),
  limite: z.coerce.number().int().min(1).max(200).default(60),
})

export type CrearNotaInput = z.infer<typeof CrearNotaSchema>
export type FiltroBitacora = z.infer<typeof FiltroBitacoraSchema>

export type EntradaCerebro = {
  id: string
  entidad_tipo: EntidadTipo
  entidad_id: string | null
  entidad_nombre: string
  fuente: FuenteEntrada
  titulo: string
  contenido: string | null
  autor_id: string | null
  autor_nombre: string | null
  ocurrio_at: string
  metadata: Record<string, unknown>
}

export const FUENTE_LABEL: Record<FuenteEntrada, string> = {
  whatsapp: 'WhatsApp',
  interaccion: 'Contacto',
  reunion: 'Reunión',
  venta: 'Venta',
  estado: 'Cambio de estado',
  nota: 'Nota',
  scraper: 'Scraper',
  sistema: 'Sistema',
}

/** Color por fuente, para que el timeline se lea de un vistazo. */
export const FUENTE_COLOR: Record<FuenteEntrada, string> = {
  whatsapp: 'oklch(72% 0.17 145)',
  interaccion: 'oklch(70% 0.15 250)',
  reunion: 'oklch(70% 0.16 300)',
  venta: 'oklch(78% 0.16 85)',
  estado: 'oklch(70% 0.14 200)',
  nota: 'oklch(70% 0.02 260)',
  scraper: 'oklch(68% 0.12 30)',
  sistema: 'oklch(60% 0.02 260)',
}

export const ENTIDAD_LABEL: Record<EntidadTipo, string> = {
  lead: 'Lead',
  cliente: 'Cliente',
  proyecto: 'Proyecto',
  reunion: 'Reunión',
  venta: 'Venta',
  equipo: 'Equipo',
}

/** Agrupa por día para pintar la bitácora con encabezados de fecha. */
export function agruparPorDia(entradas: EntradaCerebro[]): { dia: string; entradas: EntradaCerebro[] }[] {
  const grupos = new Map<string, EntradaCerebro[]>()

  for (const entrada of entradas) {
    // Fecha local de Santiago: en UTC, un evento de las 21:00 caería al día siguiente.
    const dia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(entrada.ocurrio_at))

    const lista = grupos.get(dia) ?? []
    lista.push(entrada)
    grupos.set(dia, lista)
  }

  return [...grupos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dia, entradas]) => ({ dia, entradas }))
}
