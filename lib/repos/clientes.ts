import { createClient } from '@/lib/supabase/server'
import type { Cliente, ClienteInsert, ClienteUpdate } from '@/lib/types/cliente'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

export class ClientesRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  async list(): Promise<Cliente[]> {
    const { data, error } = await this.sb
      .from('dim_clientes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as Cliente[]
  }

  async getById(id: string): Promise<Cliente | null> {
    const { data, error } = await this.sb
      .from('dim_clientes')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data as Cliente
  }

  async create(data: ClienteInsert): Promise<string> {
    const { data: row, error } = await this.sb
      .from('dim_clientes')
      .insert(data)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (row as { id: string }).id
  }

  async update(id: string, data: ClienteUpdate): Promise<void> {
    const { error } = await this.sb
      .from('dim_clientes')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw new Error(error.message)
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.sb.from('dim_clientes').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }
}
