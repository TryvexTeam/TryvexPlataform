import { createClient } from '@/lib/supabase/server'
import type { LeadInsert, LeadUpdate, Lead, Interaccion } from '@/lib/types/lead'
import type { FilaAccionHoy, SerieDia } from '@/lib/types/dashboard'
import { diaSantiago } from '@/lib/utils/fecha-santiago'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class LeadsRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  async list(filters?: {
    estado?: string
    nicho?: string
    localidad?: string
    origen?: string
    responsable_id?: string
    search?: string
  }): Promise<Lead[]> {
    let query = this.sb
      .from('fact_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.estado) query = query.eq('estado', filters.estado)
    if (filters?.nicho) query = query.eq('nicho', filters.nicho)
    if (filters?.localidad) query = query.eq('localidad', filters.localidad)
    if (filters?.origen) query = query.eq('origen', filters.origen)
    if (filters?.responsable_id) query = query.eq('responsable_id', filters.responsable_id)
    if (filters?.search) query = query.ilike('nombre_negocio', `%${filters.search}%`)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as Lead[]
  }

  async getById(id: string): Promise<Lead | null> {
    const { data, error } = await this.sb
      .from('fact_leads')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return null
    return data as Lead
  }

  async create(data: LeadInsert): Promise<string> {
    const { data: row, error } = await this.sb
      .from('fact_leads')
      .insert(data)
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return (row as { id: string }).id
  }

  async update(id: string, data: LeadUpdate): Promise<void> {
    const { error } = await this.sb
      .from('fact_leads')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(error.message)
  }

  async cambiarEstado(id: string, estado: Lead['estado']): Promise<void> {
    const { error } = await this.sb
      .from('fact_leads')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(error.message)
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.sb.from('fact_leads').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /**
   * Cuantos leads hay en un estado, sin traerse las filas.
   *
   * Se agrego para el Panel de Mando (PRP-008 fase 5.1): el dashboard viejo hacia
   * `.list()` completo de leads y contaba en JS. Con `head: true` la base devuelve
   * solo el conteo. `soloIds` acota a los leads asignados a alguien ("lo mio").
   */
  async contarPorEstado(estado: string, soloIds?: string[]): Promise<number> {
    if (soloIds && soloIds.length === 0) return 0

    let query = this.sb
      .from('fact_leads')
      .select('id', { count: 'exact', head: true })
      .eq('estado', estado)

    if (soloIds) query = query.in('id', soloIds)

    const { count, error } = await query
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  /**
   * Leads sin contactar ordenados por score de IA, para el Panel de Mando.
   *
   * El orden es la razon de ser del metodo: el score que ya calcula el CRM
   * (`score` 1-10, nullable) decide a quien llamar primero, y los sin
   * calificar caen al final — no se les inventa un cero, que los mandaria
   * al fondo del ranking como si la IA los hubiera descartado.
   *
   * Sin `integranteId` cuenta como vista de equipo: todos los leads sin
   * contactar, no solo los propios.
   */
  async listSinContactarPorScore(
    integranteId: string | null,
    limite: number,
  ): Promise<Pick<Lead, 'id' | 'nombre_negocio' | 'nicho' | 'localidad' | 'score' | 'origen'>[]> {
    let idsPropios: string[] | null = null

    if (integranteId) {
      // Mismo patron de dos pasos que `listarRequiereAccionHoy`: la
      // asignacion vive en `lead_asignaciones`, no en una columna de leads.
      const { data: asignaciones, error: errorAsig } = await this.sb
        .from('lead_asignaciones')
        .select('lead_id')
        .eq('integrante_id', integranteId)

      if (errorAsig) throw new Error(errorAsig.message)

      idsPropios = ((asignaciones ?? []) as { lead_id: string }[]).map((a) => a.lead_id)
      if (idsPropios.length === 0) return []
    }

    let query = this.sb
      .from('fact_leads')
      .select('id, nombre_negocio, nicho, localidad, score, origen')
      .eq('estado', 'sin_contactar')
      .order('score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(limite)

    if (idsPropios) query = query.in('id', idsPropios)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as Pick<
      Lead,
      'id' | 'nombre_negocio' | 'nicho' | 'localidad' | 'score' | 'origen'
    >[]
  }

  /**
   * Interacciones por dia de Santiago en [desdeISO, hastaISO), con dias vacios
   * en 0, para el sparkline semanal del Panel de Mando (PRP-008 fase 5.2).
   *
   * Se agrego porque `listInteracciones` es por lead y el dashboard necesita
   * una serie por dia de quien interactuo. No existe vista ni RPC que agrupe
   * `interacciones_lead` por dia (gap de T-001), asi que se piden solo los
   * `created_at` del rango (columna liviana) y la agrupacion por dia de
   * America/Santiago se hace aca: agrupar por el dia UTC moveria al dia
   * siguiente todo lo registrado despues de las 20:00/21:00 local
   * (riesgo marcado en T-001 §11).
   */
  async contarInteraccionesPorDia(
    desdeISO: string,
    hastaISO: string,
    integranteId?: string,
  ): Promise<SerieDia[]> {
    let query = this.sb
      .from('interacciones_lead')
      .select('created_at')
      .gte('created_at', desdeISO)
      .lt('created_at', hastaISO)

    if (integranteId) query = query.eq('integrante_id', integranteId)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const porDia = new Map<string, number>()
    for (const fila of (data ?? []) as { created_at: string }[]) {
      const dia = diaSantiago(fila.created_at)
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1)
    }

    // Dias completos del rango (el dia final es exclusivo por el `lt`),
    // con 0 donde no hubo interacciones: el sparkline necesita la serie
    // completa para no mentir con huecos.
    const dias: string[] = []
    const primerDia = diaSantiago(desdeISO)
    const ultimoDia = diaSantiago(new Date(new Date(hastaISO).getTime() - 1))
    const [y, m, d] = primerDia.split('-').map(Number)
    const cursor = new Date(Date.UTC(y, m - 1, d))
    const ultimo = new Date(`${ultimoDia}T00:00:00Z`)
    while (cursor <= ultimo) {
      dias.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    return dias.map((dia) => ({ dia, total: porDia.get(dia) ?? 0 }))
  }

  /**
   * Interacciones del rango agrupadas por integrante, para el marcador del
   * equipo. Devuelve solo a quien tuvo al menos una: quien no aparece no
   * queda expuesto con un cero público.
   *
   * Se piden solo los `integrante_id` del rango (columna liviana) y se
   * agrupa aca: no hay vista ni RPC que lo haga (mismo gap de T-001 que
   * obliga a agrupar `contarInteraccionesPorDia` en memoria).
   */
  async contarInteraccionesPorIntegrante(
    desdeISO: string,
    hastaISO: string,
  ): Promise<Map<string, number>> {
    const { data, error } = await this.sb
      .from('interacciones_lead')
      .select('integrante_id')
      .gte('created_at', desdeISO)
      .lt('created_at', hastaISO)
      .not('integrante_id', 'is', null)

    if (error) throw new Error(error.message)

    const porIntegrante = new Map<string, number>()
    for (const fila of (data ?? []) as { integrante_id: string }[]) {
      porIntegrante.set(fila.integrante_id, (porIntegrante.get(fila.integrante_id) ?? 0) + 1)
    }
    return porIntegrante
  }

  async listInteracciones(leadId: string): Promise<Interaccion[]> {
    const { data, error } = await this.sb
      .from('interacciones_lead')
      .select('*, dim_integrantes ( nombre, avatar_url )')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return ((data ?? []) as (Interaccion & { dim_integrantes: { nombre: string; avatar_url: string | null } | null })[]).map((i) => ({
      ...i,
      integrante: i.dim_integrantes ?? null,
    }))
  }

  /**
   * Leads "Requiere acción hoy" (T-012 §4): los del integrante ordenados por
   * días sin contacto descendente, con estado y última interacción.
   *
   * Se agregó porque la tabla nueva del Panel de Mando necesita exactamente
   * esa vista y nada existente la servía: `leadsDeIntegrante` solo devuelve
   * asignaciones (sin datos del lead) y `list` no ordena por antigüedad de
   * contacto. El `limit(10)` va en la query — `lead_asignaciones` puede
   * tener cientos de filas por integrante y traerlas todas para recortar
   * después es el anti-patrón marcado en T-001.
   *
   * Los días sin contacto se calculan en días de Santiago (`diaSantiago`),
   * no restando timestamps UTC: la operación corre en America/Santiago y un
   * contacto de las 22:00 local ya es "ayer" en UTC.
   */
  async listarRequiereAccionHoy(integranteId: string, hoy: string): Promise<FilaAccionHoy[]> {
    // Paso 1: los lead_id asignados al integrante (mismo patrón de dos pasos
    // que usa la vista "lo mío" de `page.tsx` con leadsDeIntegrante).
    const { data: asignaciones, error: errorAsig } = await this.sb
      .from('lead_asignaciones')
      .select('lead_id')
      .eq('integrante_id', integranteId)

    if (errorAsig) throw new Error(errorAsig.message)

    const leadIds = ((asignaciones ?? []) as { lead_id: string }[]).map((a) => a.lead_id)
    if (leadIds.length === 0) return []

    // Paso 2: los leads con su última interacción embebida, ordenados por
    // antigüedad de contacto (nulls primero = nunca contactados arriba) y
    // limitados a 10 EN LA QUERY, no en JS.
    const { data, error } = await this.sb
      .from('fact_leads')
      .select(
        `id, nombre_negocio, localidad, estado, ultimo_contacto, created_at,
         interacciones_lead ( tipo, created_at )`
      )
      .in('id', leadIds)
      // Estados cerrados no requieren acción: si ya se ganó, perdió o
      // descartó, escribirle hoy no mueve nada.
      .not('estado', 'in', '("ganado","perdido","descartado")')
      .order('ultimo_contacto', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true })
      .limit(10)

    if (error) throw new Error(error.message)

    const hoyMs = new Date(`${hoy}T00:00:00Z`).getTime()

    return ((data ?? []) as {
      id: string
      nombre_negocio: string
      localidad: string | null
      estado: Lead['estado']
      ultimo_contacto: string | null
      created_at: string
      interacciones_lead: { tipo: Interaccion['tipo']; created_at: string }[] | null
    }[]).map((fila) => {
      // La última interacción: el embed no garantiza orden entre filas
      // hijas, así que se resuelve con un máximo local — sobre las
      // interacciones de UN lead ya acotado, no sobre la tabla completa.
      let ultimoTipo: Interaccion['tipo'] | null = null
      let ultimoDia: string | null = null
      for (const inter of fila.interacciones_lead ?? []) {
        const dia = diaSantiago(inter.created_at)
        if (ultimoDia === null || dia > ultimoDia) {
          ultimoDia = dia
          ultimoTipo = inter.tipo
        }
      }

      // Sin `ultimo_contacto` se usa created_at como referencia: un lead
      // que llegó ayer y nunca se tocó también "requiere acción".
      const referencia = fila.ultimo_contacto ?? fila.created_at
      const dias = Math.floor(
        (hoyMs - new Date(`${diaSantiago(referencia)}T00:00:00Z`).getTime()) / 86_400_000,
      )

      return {
        lead_id: fila.id,
        nombre_negocio: fila.nombre_negocio,
        localidad: fila.localidad,
        estado: fila.estado,
        dias_sin_contacto: Number.isFinite(dias) && dias >= 0 ? dias : null,
        ultimo_tipo: ultimoTipo,
        ultimo_dia: ultimoDia,
      }
    })
  }

  async createInteraccion(data: {
    lead_id: string
    integrante_id: string
    tipo: Interaccion['tipo']
    contenido?: string | null
    respondio?: boolean | null
  }): Promise<void> {
    const { error } = await this.sb.from('interacciones_lead').insert(data)
    if (error) throw new Error(error.message)
  }

  async insertarMuchos(leads: LeadInsert[]): Promise<{ inserted: number; errors: string[] }> {
    const errors: string[] = []
    let inserted = 0

    for (const lead of leads) {
      const { error } = await this.sb.from('fact_leads').insert(lead)
      if (error) errors.push(`${lead.nombre_negocio}: ${error.message}`)
      else inserted++
    }

    return { inserted, errors }
  }
}
