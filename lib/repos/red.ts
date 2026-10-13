import type { SupabaseClient } from '@supabase/supabase-js'

/** Ambas RPC son solo de service_role (migración 121): usar un cliente admin. */
export class RedRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async registrarIpDe(integranteId: string, ip: string | null): Promise<void> {
    if (!ip) return
    const { error } = await this.sb.rpc('registrar_ip_de', { p_integrante_id: integranteId, p_ip: ip })
    if (error) console.error('[red] no se pudo registrar la IP:', error.message)
  }

  /** `null` = no se pudo comprobar (el llamador decide y NO debe cachearlo). */
  async ipBloqueada(ip: string | null): Promise<boolean | null> {
    if (!ip) return false
    const { data, error } = await this.sb.rpc('ip_bloqueada', { p_ip: ip })
    if (error) {
      console.error('[red] no se pudo comprobar la IP; se permite el acceso:', error.message)
      return null
    }
    return data === true
  }
}
