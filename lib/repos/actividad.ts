import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/** Lo que `actividad.referencia_tipo` acepta desde el schema inicial. */
export type ReferenciaTipo = 'lead' | 'tarea' | 'proyecto' | 'cliente' | 'reunion' | 'venta'

export type EventoActividad = {
  integrante_id: string | null
  tipo_evento: string
  referencia_id?: string | null
  referencia_tipo?: ReferenciaTipo | null
  descripcion?: string | null
}

/**
 * Bitacora del CRM: quien hizo que, sobre que, y cuando.
 *
 * La tabla `actividad` existe desde `000_schema_inicial.sql` —con 'lead' ya
 * dentro del CHECK de `referencia_tipo` y un indice por `created_at DESC`— y
 * al 13-sep-2026 estaba VACIA: se diseno y nunca se llamo desde ningun lado.
 * Por eso, cuando desaparecieron 57 leads entre el 31-ago y el 10-sep, no hubo
 * a quien preguntarle. El hueco era la unica evidencia.
 *
 * ⚠️ `referencia_id` es un UUID SIN clave foranea (a proposito, verificado en el
 * schema): asi el registro sobrevive al borrado definitivo de la fila que
 * describe. Una bitacora que se borra junto con lo que registra no sirve de
 * nada — que es justo lo que pasa con todo lo demas que cuelga de fact_leads,
 * atado con ON DELETE CASCADE.
 */
export class ActividadRepository {
  private sb: SupabaseClient<Database>

  constructor(supabase: SupabaseClient<Database>) {
    this.sb = supabase
  }

  /**
   * Registra un evento. NUNCA lanza.
   *
   * Es deliberado: la bitacora acompana a la accion, no la gobierna. Si dejar
   * constancia fallara y eso tirara la peticion, mover un lead a la papelera
   * podria terminar en error DESPUES de haberlo movido — y el usuario veria un
   * fallo sobre algo que si ocurrio. Se prefiere perder una linea de bitacora
   * (queda en consola) antes que mentirle a quien la ejecuto.
   */
  async registrar(evento: EventoActividad): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (this.sb as any).from('actividad').insert({
        integrante_id: evento.integrante_id,
        tipo_evento: evento.tipo_evento,
        referencia_id: evento.referencia_id ?? null,
        referencia_tipo: evento.referencia_tipo ?? null,
        descripcion: evento.descripcion ?? null,
      })
      if (error) console.error('[actividad] no se pudo registrar', evento.tipo_evento, error.message)
    } catch (e) {
      console.error('[actividad] no se pudo registrar', evento.tipo_evento, e)
    }
  }

  /** Ultimos eventos, mas recientes primero. Para la pantalla de bitacora. */
  async ultimos(limite = 100, referenciaTipo?: ReferenciaTipo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (this.sb as any)
      .from('actividad')
      .select('*, dim_integrantes ( nombre, avatar_url )')
      .order('created_at', { ascending: false })
      .limit(limite)
    if (referenciaTipo) q = q.eq('referencia_tipo', referenciaTipo)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data ?? []
  }
}
