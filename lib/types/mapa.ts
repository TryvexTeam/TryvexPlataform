import type { EstadoLead } from '@/lib/types/lead'

/** Un lead con ubicación, tal como lo dibuja el mapa (migración 127). */
export interface LeadEnMapa {
  id: string
  nombre: string
  estado: EstadoLead
  nicho: string | null
  localidad: string | null
  rating: number | null
  resenas: number | null
  tieneWeb: boolean | null
  urlWeb: string | null
  placeId: string | null
  lat: number
  lng: number
}

export interface DatosMapa {
  leads: LeadEnMapa[]
  /** Leads que todavía no tienen coordenadas (se rellenan con scraper/rellenar_coordenadas.py). */
  sinUbicacion: number
}

/** Link para abrir el local en Google Maps: por su `cid` si se puede, si no por coordenadas. */
export function linkGoogleMaps(lead: Pick<LeadEnMapa, 'placeId' | 'lat' | 'lng'>): string {
  const segunda = lead.placeId?.split(':')[1]
  if (segunda && /^0x[0-9a-f]+$/i.test(segunda)) {
    return `https://www.google.com/maps?cid=${BigInt(segunda).toString()}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${lead.lat},${lead.lng}`
}

/**
 * La ruta de visitas en Google Maps (gratis, sin API): parte desde donde esté
 * quien la abre y pasa por los locales en el orden elegido. Google acepta hasta
 * 9 paradas intermedias en este formato.
 */
export const MAX_PARADAS = 10

export function linkRuta(paradas: Pick<LeadEnMapa, 'lat' | 'lng'>[]): string | null {
  if (paradas.length === 0) return null
  const punto = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`
  const destino = paradas[paradas.length - 1]
  const intermedias = paradas.slice(0, -1).slice(0, MAX_PARADAS - 1)
  const params = new URLSearchParams({ api: '1', destination: punto(destino), travelmode: 'driving' })
  if (intermedias.length) params.set('waypoints', intermedias.map(punto).join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
