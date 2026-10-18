import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/server'
import type {
  AsignacionConIntegrante,
  LeadAsignacion,
  RolAsignacion,
} from '@/lib/types/asignacion'

type SB = SupabaseClient<Database>

/**
 * Asignación de leads y citas a integrantes.
 *
 * Por qué existe (PRP-008): la asignación manual ya se había intentado con
 * `fact_leads.responsable_id` y fracasó en silencio — 541 leads, 0 asignados.
 * Nadie entra a marcar "este lead es mío" antes de escribirle. Por eso la vía
 * principal es `autoAsignarPorContacto`, que se dispara sola al contactar.
 */
/**
 * Cuántos ids caben en un `.in()` por consulta.
 *
 * El filtro viaja en la URL, así que el límite real es el largo de la petición,
 * no la base. Con 200 UUID la URL ronda los 7.400 caracteres.
 */
const LOTE_IDS = 200

export class AsignacionesRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /**
   * Registra que este integrante contactó al lead.
   *
   * El primero en llegar queda `owner`; los siguientes, `colaborador`. Si ya
   * estaba asignado no hace nada — no degrada a un owner existente ni duplica.
   *
   * Es idempotente a propósito: se llama en cada envío de mensaje, así que
   * tiene que ser barato y no romper el envío si falla.
   *
   * @returns el rol con el que quedó, o null si ya estaba asignado.
   */
  async autoAsignarPorContacto(
    leadId: string,
    integranteId: string
  ): Promise<RolAsignacion | null> {
    const { data: existente } = await this.sb
      .from('lead_asignaciones')
      .select('rol')
      .eq('lead_id', leadId)
      .eq('integrante_id', integranteId)
      .maybeSingle()

    if (existente) return null

    // ¿Hay alguien más ya asignado? Si no, este es el primero y queda owner.
    const { count } = await this.sb
      .from('lead_asignaciones')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId)

    let rol: RolAsignacion = (count ?? 0) === 0 ? 'owner' : 'colaborador'

    const { error } = await this.sb
      .from('lead_asignaciones')
      .insert({ lead_id: leadId, integrante_id: integranteId, rol, asignado_por: integranteId })

    if (error) {
      // Dos carreras posibles, mismo código 23505 pero distinto significado:
      // - PK (lead_id, integrante_id): este integrante ya estaba asignado
      //   (otro request paralelo lo insertó primero) — no hay nada que hacer.
      // - unique parcial (lead_id) WHERE rol='owner' (migración 072): OTRO
      //   integrante ganó la carrera por "owner" entre el SELECT count y este
      //   INSERT. En ese caso el rol calculado era incorrecto — reintentar
      //   como 'colaborador' en vez de devolver null, que dejaría a este
      //   integrante sin ninguna fila y "silenciosamente" desasignado.
      if (error.code === '23505') {
        if (rol === 'owner') {
          rol = 'colaborador'
          const reintento = await this.sb
            .from('lead_asignaciones')
            .insert({ lead_id: leadId, integrante_id: integranteId, rol, asignado_por: integranteId })
          if (reintento.error) {
            if (reintento.error.code === '23505') return null
            throw new Error(reintento.error.message)
          }
          return rol
        }
        return null
      }
      throw new Error(error.message)
    }

    return rol
  }

  /** Asignación manual: sumar a alguien que no escribió (complemento, no vía principal). */
  async asignarLead(
    leadId: string,
    integranteId: string,
    rol: RolAsignacion,
    asignadoPor: string
  ): Promise<void> {
    const { error } = await this.sb
      .from('lead_asignaciones')
      .upsert(
        { lead_id: leadId, integrante_id: integranteId, rol, asignado_por: asignadoPor },
        { onConflict: 'lead_id,integrante_id' }
      )

    if (error) throw new Error(error.message)
  }

  async desasignarLead(leadId: string, integranteId: string): Promise<void> {
    const { error } = await this.sb
      .from('lead_asignaciones')
      .delete()
      .eq('lead_id', leadId)
      .eq('integrante_id', integranteId)

    if (error) throw new Error(error.message)
  }

  /** Asignados de un lead, con avatar y color — alimenta el stack de la tarjeta. */
  async asignacionesDeLead(leadId: string): Promise<AsignacionConIntegrante[]> {
    const { data, error } = await this.sb
      .from('lead_asignaciones')
      .select(
        // Desambiguado por nombre de FK: `lead_asignaciones` tiene DOS FKs a
        // `dim_integrantes` (`integrante_id` y `asignado_por`). Sin nombrar cuál,
        // PostgREST no resuelve la relación y responde 500.
        'integrante_id, rol, dim_integrantes!lead_asignaciones_integrante_id_fkey ( nombre, avatar_url, color )'
      )
      .eq('lead_id', leadId)
      .order('rol', { ascending: true })

    if (error) throw new Error(error.message)
    // `rol` es TEXT con CHECK en la base, así que el tipo generado dice
    // `string`. El CHECK garantiza el dominio; la conversión lo afirma acá.
    return mapearAsignaciones(data as unknown as FilaAsignacion[])
  }

  /**
   * Asignados de varios leads a la vez, indexados por `lead_id`.
   *
   * El kanban pinta cientos de tarjetas: pedir los asignados de una en una
   * sería el N+1 clásico. Esta es la que debe usar la lista.
   */
  async asignacionesDeLeads(
    leadIds: string[]
  ): Promise<Record<string, AsignacionConIntegrante[]>> {
    if (leadIds.length === 0) return {}

    const porLead: Record<string, AsignacionConIntegrante[]> = {}

    /*
     * Por lotes, y no con un `.in()` de la lista entera.
     *
     * PostgREST manda el filtro en la URL: con 541 leads (que ya hay hoy) eso
     * son ~20.000 caracteres, y el `fetch` del servidor de Next se quedaba
     * colgado diez segundos y terminaba en "fetch failed" — la página de leads
     * dejaba de cargar por completo. La consulta no era lenta: la URL era
     * impracticable.
     *
     * 200 ids son unos 7.400 caracteres, con margen de sobra bajo cualquier
     * límite razonable. Los lotes van EN SERIE y no en paralelo: son pocos y
     * lanzarlos a la vez solo cambiaría un problema de tamaño por uno de
     * concurrencia contra la base.
     */
    for (let i = 0; i < leadIds.length; i += LOTE_IDS) {
      const lote = leadIds.slice(i, i + LOTE_IDS)

      const { data, error } = await this.sb
        .from('lead_asignaciones')
        .select(
          'lead_id, integrante_id, rol, dim_integrantes!lead_asignaciones_integrante_id_fkey ( nombre, avatar_url, color )'
        )
        .in('lead_id', lote)

      if (error) throw new Error(error.message)

      for (const fila of data ?? []) {
        const lista = (porLead[fila.lead_id] ??= [])
        lista.push(...mapearAsignaciones([fila as unknown as FilaAsignacion]))
      }
    }
    // El owner primero: es el que se ve cuando el stack se recorta a "+N".
    for (const lista of Object.values(porLead)) {
      lista.sort((a, b) => (a.rol === 'owner' ? -1 : b.rol === 'owner' ? 1 : 0))
    }
    return porLead
  }

  /** Los leads de un integrante — vista "lo mío" del dashboard. */
  async leadsDeIntegrante(integranteId: string): Promise<LeadAsignacion[]> {
    const { data, error } = await this.sb
      .from('lead_asignaciones')
      .select('*')
      .eq('integrante_id', integranteId)

    if (error) throw new Error(error.message)
    return (data ?? []) as LeadAsignacion[]
  }

  /**
   * Conteo de leads asignados por integrante — KPI del dashboard.
   *
   * Se agrega en memoria a propósito: el volumen actual es de cientos de filas.
   * Si crece, el reemplazo es una vista materializada, no más JS (ver T-001,
   * sección de agregaciones costosas).
   */
  async conteoPorIntegrante(): Promise<Record<string, number>> {
    const { data, error } = await this.sb
      .from('lead_asignaciones')
      .select('integrante_id')

    if (error) throw new Error(error.message)

    const conteo: Record<string, number> = {}
    for (const fila of data ?? []) {
      conteo[fila.integrante_id] = (conteo[fila.integrante_id] ?? 0) + 1
    }
    return conteo
  }

  /** Un integrante se suma a una cita existente. La RLS (051) exige que sea él mismo. */
  async autoAsignarseEvento(eventoId: string, integranteId: string): Promise<void> {
    const { error } = await this.sb
      .from('eventos_asistentes')
      .upsert(
        { evento_id: eventoId, integrante_id: integranteId, asignado_por: integranteId },
        { onConflict: 'evento_id,integrante_id' }
      )

    if (error) throw new Error(error.message)
  }

  /** Se quita a sí mismo de una cita. La RLS permite quitarse solo a uno mismo. */
  async quitarseDeEvento(eventoId: string, integranteId: string): Promise<void> {
    const { error } = await this.sb
      .from('eventos_asistentes')
      .delete()
      .eq('evento_id', eventoId)
      .eq('integrante_id', integranteId)

    if (error) throw new Error(error.message)
  }
}

interface FilaAsignacion {
  integrante_id: string
  rol: RolAsignacion
  dim_integrantes: { nombre: string; avatar_url: string | null; color: string | null } | null
}

function mapearAsignaciones(data: FilaAsignacion[] | null): AsignacionConIntegrante[] {
  return (data ?? []).map((fila) => ({
    integrante_id: fila.integrante_id,
    rol: fila.rol,
    nombre: fila.dim_integrantes?.nombre ?? 'Sin nombre',
    avatar_url: fila.dim_integrantes?.avatar_url ?? null,
    color: fila.dim_integrantes?.color ?? null,
  }))
}
