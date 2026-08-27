import { createClient } from '@/lib/supabase/server'
import type { PresenciaIntegrante } from '@/lib/types/presencia'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

/**
 * Lectura de la vista `presencia_equipo` (migración 024).
 *
 * Se agregó para el Panel de Mando (PRP-008 fase 5.1): el strip del dashboard
 * necesita la presencia propia desde el servidor, y la regla del proyecto es que
 * ninguna consulta a Supabase viva fuera de `lib/repos/`. La vista ya viene
 * pre-agregada, así que no hay agregación en JS.
 */
export class PresenciaRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Presencia de un integrante. null si la vista no tiene fila para él. */
  async miPresencia(integranteId: string): Promise<PresenciaIntegrante | null> {
    const { data, error } = await this.sb
      .from('presencia_equipo')
      .select('*')
      .eq('integrante_id', integranteId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as PresenciaIntegrante) ?? null
  }

  /** Presencia de todo el equipo. La RLS decide quién puede verla. */
  async listEquipo(): Promise<PresenciaIntegrante[]> {
    const { data, error } = await this.sb
      .from('presencia_equipo')
      .select('*')
      .eq('es_del_equipo', true)
      .order('nombre')
    if (error) throw new Error(error.message)
    return (data ?? []) as PresenciaIntegrante[]
  }
}
