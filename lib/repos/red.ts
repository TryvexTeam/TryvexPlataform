import type { SupabaseClient } from '@supabase/supabase-js'

export class RedRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async registrarIp(ip: string | null): Promise<void> {
    if (!ip) return
    const { error } = await this.sb.rpc('registrar_ip', { p_ip: ip })
    if (error) console.error('[red] no se pudo registrar la IP:', error.message)
  }

  async ipBloqueada(ip: string | null): Promise<boolean> {
    if (!ip) return false
    const { data, error } = await this.sb.rpc('ip_bloqueada', { p_ip: ip })
    if (error) {
      console.error('[red] no se pudo comprobar la IP; se permite el acceso:', error.message)
      return false
    }
    return data === true
  }
}
