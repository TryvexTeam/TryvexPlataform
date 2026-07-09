import { createClient } from '@/lib/supabase/server'
import type { Venta, VentaInsert, VentaUpdate } from '@/lib/types/proyecto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export class PagosRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  async listByCliente(clienteId: string): Promise<Venta[]> {
    const { data, error } = await this.sb
      .from('fact_ventas')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as Venta[]
  }

  async create(data: VentaInsert): Promise<string> {
    const { data: row, error } = await this.sb
      .from('fact_ventas')
      .insert(data)
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (row as { id: string }).id
  }

  async update(id: string, data: VentaUpdate): Promise<void> {
    const { error } = await this.sb.from('fact_ventas').update(data).eq('id', id)
    if (error) throw new Error(error.message)
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.sb.from('fact_ventas').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }
}
