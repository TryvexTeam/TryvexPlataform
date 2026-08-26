import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export interface SuscripcionPushInput {
  integranteId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
}

export class PushRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Alta o renovación de la suscripción de un navegador (clave: endpoint). */
  async guardar(input: SuscripcionPushInput): Promise<void> {
    const { error } = await this.sb.from('push_subscriptions').upsert(
      {
        integrante_id: input.integranteId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
      },
      { onConflict: 'endpoint' },
    )
    if (error) throw new Error(error.message)
  }

  async eliminar(endpoint: string, integranteId: string): Promise<void> {
    const { error } = await this.sb
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('integrante_id', integranteId)
    if (error) throw new Error(error.message)
  }
}
