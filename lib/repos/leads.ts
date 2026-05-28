import { createClient } from '@/lib/supabase/server'
import type { LeadInsert, LeadUpdate, Lead, Interaccion } from '@/lib/types/lead'

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
