import { createClient } from '@/lib/supabase/server'
import type { Notificaciones } from '@/lib/types/integrante'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

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

  /**
   * Borra notificaciones propias. Sin `ids` limpia la bandeja entera.
   *
   * Borrado real, no un campo `archivada`: una notificación es un aviso de
   * algo que pasó en otra tabla, y el hecho en sí queda registrado ahí. La
   * fila de aquí solo existe para avisar, así que descartada no vale nada.
   *
   * El `eq('integrante_id')` va aunque la RLS ya acote por dueño: si un día
   * alguien llama a este repo con la clave de servicio (que salta la RLS),
   * el filtro sigue impidiendo borrar la bandeja de otra persona.
   */
  async eliminar(integranteId: string, ids?: string[]): Promise<void> {
    let query = this.sb
      .from('notificaciones')
      .delete()
      // `select` para que PostgREST devuelva lo que borró: sin esto un rechazo
      // de la RLS llega como éxito con cero filas, y la interfaz daría por
      // descartado algo que sigue ahí. Un borrado que no borra tiene que
      // gritar, no pasar callando.
      .select('id')
      .eq('integrante_id', integranteId)
    if (ids && ids.length > 0) query = query.in('id', ids)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const borradas = ((data ?? []) as { id: string }[]).length
    if (ids && ids.length > 0 && borradas === 0) {
      throw new Error(
        'La base no borró ninguna notificación: falta la política DELETE de RLS en `notificaciones`.',
      )
    }
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

      const { error: errorInsert } = await this.sb.from('notificaciones').insert(
        habilitados.map((integrante_id) => ({
          integrante_id,
          tipo: input.tipo,
          titulo: input.titulo,
          cuerpo: input.cuerpo ?? null,
          link: input.link ?? null,
        }))
      )
      // No se relanza: `notificar` es best-effort y no debe romper la operación
      // principal. Pero antes ni se miraba: un INSERT rechazado (RLS, columna
      // faltante, etc.) desaparecía sin dejar rastro y "no me llegó la campanita"
      // era indiagnosticable.
      if (errorInsert) {
        console.error('[notificar] no se pudo insertar la notificación', {
          tipo: input.tipo,
          destinatarios: habilitados.length,
          error: errorInsert.message,
        })
      }

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
