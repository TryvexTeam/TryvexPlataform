import { createClient } from '@/lib/supabase/server'
import type { Integrante, PerfilUpdate } from '@/lib/types/integrante'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class IntegrantesRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  async getByAuthUser(authUserId: string): Promise<Integrante | null> {
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select('*')
      .eq('auth_user_id', authUserId)
      .single()
    if (error || !data) return null
    return data as Integrante
  }

  /** Integrantes activos con su color — para el selector y el calendario */
  async listActivos(): Promise<Pick<Integrante, 'id' | 'nombre' | 'avatar_url' | 'color' | 'auth_user_id'>[]> {
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select('id, nombre, avatar_url, color, auth_user_id')
      .eq('activo', true)
      .order('nombre')
    if (error) throw new Error(error.message)
    return data ?? []
  }

  /** Actualiza el perfil propio. Lanza 'color_ocupado' si otro integrante ya usa ese color. */
  async updatePerfil(integranteId: string, data: PerfilUpdate): Promise<void> {
    if (data.color) {
      const { data: dueno } = await this.sb
        .from('dim_integrantes')
        .select('id')
        .eq('color', data.color)
        .neq('id', integranteId)
        .maybeSingle()
      if (dueno) throw new Error('color_ocupado')
    }

    const { error } = await this.sb
      .from('dim_integrantes')
      .update(data)
      .eq('id', integranteId)
    if (error) {
      // El índice único puede ganar la carrera aunque la pre-verificación pase
      if (error.code === '23505') throw new Error('color_ocupado')
      throw new Error(error.message)
    }
  }
}
