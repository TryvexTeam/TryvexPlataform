import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatosMapa, LeadEnMapa } from '@/lib/types/mapa'
import type { EstadoLead } from '@/lib/types/lead'

/**
 * Los leads para el mapa. `lat`/`lng` son de la migración 127 y los tipos generados
 * todavía no los conocen: la consulta va sin tipar acá, en un solo lugar.
 */
export class MapaRepository {
  private sb: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.sb = supabase as unknown as SupabaseClient
  }

  async obtener(): Promise<DatosMapa> {
    const [conUbicacion, sinUbicacion] = await Promise.all([
      this.sb
        .from('fact_leads')
        .select('id, nombre_negocio, estado, nicho, localidad, google_rating, google_resenas, tiene_web, url_web, google_place_id, lat, lng')
        .is('eliminado_at', null)
        .not('lat', 'is', null)
        .limit(5000),
      this.sb
        .from('fact_leads')
        .select('id', { count: 'exact', head: true })
        .is('eliminado_at', null)
        .is('lat', null),
    ])
    if (conUbicacion.error) throw new Error(conUbicacion.error.message)
    if (sinUbicacion.error) throw new Error(sinUbicacion.error.message)

    type Fila = {
      id: string
      nombre_negocio: string
      estado: EstadoLead
      nicho: string | null
      localidad: string | null
      google_rating: number | null
      google_resenas: number | null
      tiene_web: boolean | null
      url_web: string | null
      google_place_id: string | null
      lat: number
      lng: number
    }
    const leads: LeadEnMapa[] = ((conUbicacion.data ?? []) as Fila[]).map((f) => ({
      id: f.id,
      nombre: f.nombre_negocio,
      estado: f.estado,
      nicho: f.nicho,
      localidad: f.localidad,
      rating: f.google_rating,
      resenas: f.google_resenas,
      tieneWeb: f.tiene_web,
      urlWeb: f.url_web,
      placeId: f.google_place_id,
      lat: f.lat,
      lng: f.lng,
    }))
    return { leads, sinUbicacion: sinUbicacion.count ?? 0 }
  }
}
