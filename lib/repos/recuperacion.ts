import { createAdminClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

/**
 * Acceso a los datos del flujo "olvidé mi contraseña". Usa el cliente admin porque
 * el endpoint que lo llama es anónimo por diseño: quien pide el link todavía no tiene
 * sesión. Por eso mismo la tabla de intentos no está expuesta a 'authenticated'.
 */
export class RecuperacionRepository {
  private sb: SB

  constructor(supabase: ReturnType<typeof createAdminClient>) {
    this.sb = supabase as SB
  }

  /** Intentos registrados en la ventana, por correo y por IP. */
  async contarIntentos(
    email: string,
    ip: string | null,
    desdeISO: string,
  ): Promise<{ porEmail: number; porIp: number }> {
    const [porEmail, porIp] = await Promise.all([
      this.sb
        .from('password_reset_intentos')
        .select('id', { count: 'exact', head: true })
        .eq('email', email)
        .gte('created_at', desdeISO),
      ip
        ? this.sb
            .from('password_reset_intentos')
            .select('id', { count: 'exact', head: true })
            .eq('ip', ip)
            .gte('created_at', desdeISO)
        : Promise.resolve({ count: 0, error: null }),
    ])

    if (porEmail.error) throw new Error(porEmail.error.message)
    if (porIp.error) throw new Error(porIp.error.message)

    return { porEmail: porEmail.count ?? 0, porIp: porIp.count ?? 0 }
  }

  async registrarIntento(email: string, ip: string | null): Promise<void> {
    const { error } = await this.sb.from('password_reset_intentos').insert({ email, ip })
    if (error) throw new Error(error.message)
  }

  /** El integrante con ese correo, sin importar mayúsculas. null si no existe. */
  async buscarIntegrantePorEmail(
    email: string,
  ): Promise<{ id: string; email: string; activo: boolean } | null> {
    const { data, error } = await this.sb
      .from('dim_integrantes')
      .select('id, email, activo')
      .ilike('email', email)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ?? null
  }

  /** hashed_token del link de recuperación, o null si Supabase no lo emitió. */
  async generarTokenRecuperacion(email: string): Promise<string | null> {
    const { data, error } = await this.sb.auth.admin.generateLink({ type: 'recovery', email })
    if (error) {
      console.error('[recuperacion] generateLink falló', error)
      return null
    }
    return data?.properties?.hashed_token ?? null
  }
}
