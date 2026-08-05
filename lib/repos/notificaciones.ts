import { createClient } from '@/lib/supabase/server'
import type { Notificaciones } from '@/lib/types/integrante'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export type TipoNotificacion = keyof Notificaciones

export interface Notificacion {
  id: string
  integrante_id: string
  tipo: TipoNotificacion
  titulo: string
  cuerpo: string | null
  link: string | null
  leida: boolean
  created_at: string
}

export class NotificacionesRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  async listRecientes(integranteId: string, limit = 30): Promise<Notificacion[]> {
    const { data, error } = await this.sb
      .from('notificaciones')
      .select('*')
      .eq('integrante_id', integranteId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return (data ?? []) as Notificacion[]
  }

  async marcarLeidas(integranteId: string, ids?: string[]): Promise<void> {
    let query = this.sb
      .from('notificaciones')
      .update({ leida: true })
      .eq('integrante_id', integranteId)
    if (ids && ids.length > 0) query = query.in('id', ids)
    const { error } = await query
    if (error) throw new Error(error.message)
  }

  /** Crea la notificación para cada destinatario que tenga el toggle activo.
   *  Best-effort: nunca lanza (los emisores no deben romper la operación principal). */
  async notificar(input: {
    destinatarios: string[]
    tipo: TipoNotificacion
    titulo: string
    cuerpo?: string
    link?: string
    excluir?: string | null
  }): Promise<void> {
    try {
      const ids = [...new Set(input.destinatarios)].filter((id) => id !== input.excluir)
      if (ids.length === 0) return

      const { data: prefs } = await this.sb
        .from('dim_integrantes')
        .select('id, notificaciones')
        .in('id', ids)

      const habilitados = ((prefs ?? []) as { id: string; notificaciones: Partial<Notificaciones> | null }[])
        .filter((p) => p.notificaciones?.[input.tipo] !== false)
        .map((p) => p.id)
      if (habilitados.length === 0) return

      await this.sb.from('notificaciones').insert(
        habilitados.map((integrante_id) => ({
          integrante_id,
          tipo: input.tipo,
          titulo: input.titulo,
          cuerpo: input.cuerpo ?? null,
          link: input.link ?? null,
        }))
      )

      // Misma notificación al celular / PC vía Web Push. Best-effort: si falla,
      // la campanita in-app ya quedó guardada arriba.
      const { enviarPush } = await import('@/lib/push/server')
      const resultado = await enviarPush(habilitados, {
        titulo: input.titulo,
        cuerpo: input.cuerpo,
        link: input.link,
        tag: input.tipo,
      })

      /**
       * El resultado se registra, no se tira.
       *
       * `enviarPush` devuelve un `motivo` cuando no manda nada
       * -- `sin_suscripciones`, `vapid_no_configurado` -- y hasta acá nadie lo
       * miraba. Con el aviso perdido y nada en los logs, "no me llegó la
       * notificación" era indiagnosticable: no se podía distinguir un teléfono
       * sin registrar de una llave que falta en el entorno.
       */
      if (resultado.enviados === 0) {
        console.warn('[notificar] push no enviado', {
          tipo: input.tipo,
          destinatarios: habilitados.length,
          motivo: resultado.motivo ?? 'todas_las_suscripciones_fallaron',
        })
      }
    } catch (err) {
      console.error('[notificar]', err instanceof Error ? err.message : err)
    }
  }

  /** IDs de todos los integrantes activos (para avisos globales como nuevo cliente) */
  async idsActivos(): Promise<string[]> {
    const { data } = await this.sb.from('dim_integrantes').select('id').eq('activo', true)
    return ((data ?? []) as { id: string }[]).map((i) => i.id)
  }
}
