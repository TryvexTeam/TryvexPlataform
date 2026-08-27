import { createClient } from '@/lib/supabase/server'
import type { IntegrantePermisos, Permiso, Privilegio } from '@/lib/types/permisos'
import { normalizarPermisos } from '@/lib/types/permisos'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

const CAMPOS =
  'id, nombre, email, avatar_url, activo, es_superadmin, ver_jornadas_equipo, ver_finanzas, gestionar_finanzas, visible_en_landing'

export class PermisosRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /**
   * Permisos de quien está usando la app. null si no es integrante ACTIVO.
   *
   * Sin este filtro, alguien dado de baja pero cuya sesión sigue viva conservaba
   * es_superadmin/ver_finanzas/gestionar_finanzas en las rutas que consultan esta
   * función en vez de IntegrantesRepository.getByAuthUser() (que sí filtra
   * activo). Ver migración 062: mismo hueco existía en soy_superadmin()/tengo_permiso().
   */
  async misPermisos(authUserId: string): Promise<IntegrantePermisos | null> {
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select(CAMPOS)
      .eq('auth_user_id', authUserId)
      .eq('activo', true)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as IntegrantePermisos) ?? null
  }

  async listEquipo(): Promise<IntegrantePermisos[]> {
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select(CAMPOS)
      .eq('activo', true)
      .order('nombre')
    if (error) throw new Error(error.message)
    return (data ?? []) as IntegrantePermisos[]
  }

  /**
   * Cambia los permisos de un integrante.
   *
   * La autorización real no está aquí: la impone el trigger `guardar_flags_privilegio`
   * de la migración 028 (extendido en la 044 para `visible_en_landing`), que rechaza el
   * UPDATE si quien lo hace no es el dueño. Esta capa es conveniencia y mensajes claros,
   * no el candado.
   */
  async actualizar(integranteId: string, cambios: Partial<Record<Permiso, boolean>>): Promise<void> {
    const { error } = await this.sb
      .from('dim_integrantes')
      .update(normalizarPermisos(cambios))
      .eq('id', integranteId)

    if (error) {
      if (error.message.includes('solo_superadmin_cambia_permisos') || error.code === '42501') {
        throw new Error('solo_superadmin')
      }
      throw new Error(error.message)
    }
  }
}

/**
 * Helper de servidor: ¿este integrante puede ver esta sección?
 *
 * Solo privilegios. `visible_en_landing` queda fuera a propósito: no habilita ninguna
 * sección, y el atajo de "el dueño puede todo" daría la respuesta equivocada (ser dueño
 * no es lo mismo que estar publicado en la landing).
 */
export function puede(
  perfil: Pick<IntegrantePermisos, 'es_superadmin' | 'ver_jornadas_equipo' | 'ver_finanzas' | 'gestionar_finanzas'> | null,
  permiso: Privilegio,
): boolean {
  if (!perfil) return false
  if (perfil.es_superadmin) return true
  if (permiso === 'ver_finanzas') return perfil.ver_finanzas || perfil.gestionar_finanzas
  return perfil[permiso]
}
