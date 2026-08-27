import { createClient } from '@/lib/supabase/server'
import type { FiltroFinanzas, Movimiento, MovimientoInsert, MovimientoUpdate } from '@/lib/types/finanzas'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

/** Minutos que vive la URL firmada de un voucher. Corta a propósito: el comprobante
 *  lleva montos y a veces datos bancarios, y una URL larga se comparte sola. */
const VOUCHER_URL_MINUTOS = 5

export class FinanzasRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /**
   * Movimientos del período. La RLS ya filtra por permiso: si quien consulta no
   * tiene 'ver_finanzas' esto vuelve vacío, no con error.
   */
  async list(filtro: FiltroFinanzas = {}): Promise<Movimiento[]> {
    let q = this.sb
      .from('movimientos_financieros')
      .select('*, cliente:dim_clientes(nombre_negocio)')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })

    if (filtro.desde) q = q.gte('fecha', filtro.desde)
    if (filtro.hasta) q = q.lte('fecha', filtro.hasta)
    if (filtro.tipo) q = q.eq('tipo', filtro.tipo)
    if (filtro.categoria) q = q.eq('categoria', filtro.categoria)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as Movimiento[]
  }

  async getById(id: string): Promise<Movimiento | null> {
    const { data, error } = await this.sb
      .from('movimientos_financieros')
      .select('*, cliente:dim_clientes(nombre_negocio)')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return (data as Movimiento) ?? null
  }

  async create(data: MovimientoInsert, creadoPor: string | null): Promise<string> {
    const { data: row, error } = await this.sb
      .from('movimientos_financieros')
      .insert({ ...data, creado_por: creadoPor })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return (row as { id: string }).id
  }

  async update(id: string, data: MovimientoUpdate): Promise<void> {
    const { error } = await this.sb.from('movimientos_financieros').update(data).eq('id', id)
    if (error) throw new Error(error.message)
  }

  /**
   * Borra el movimiento y su voucher. Primero la fila: si fallara el borrado del
   * archivo quedaría un huérfano en el bucket, molesto pero inofensivo. Al revés
   * quedaría un movimiento apuntando a un comprobante que ya no existe.
   */
  async delete(id: string): Promise<void> {
    const mov = await this.getById(id)

    const { error } = await this.sb.from('movimientos_financieros').delete().eq('id', id)
    if (error) throw new Error(error.message)

    if (mov?.voucher_path) {
      const { error: errStorage } = await this.sb.storage.from('vouchers').remove([mov.voucher_path])
      if (errStorage) console.error('[finanzas] voucher huérfano en el bucket', mov.voucher_path, errStorage)
    }
  }

  /** URL firmada de corta duración. null si el movimiento no tiene comprobante. */
  async urlVoucher(path: string): Promise<string | null> {
    const { data, error } = await this.sb.storage
      .from('vouchers')
      .createSignedUrl(path, VOUCHER_URL_MINUTOS * 60)
    if (error) throw new Error(error.message)
    return data?.signedUrl ?? null
  }

  /** Saldo por mes, ya agregado en la base. */
  async resumenMensual(desde?: string): Promise<
    { mes: string; ingresos_clp: number; egresos_clp: number; saldo_clp: number; movimientos: number }[]
  > {
    let q = this.sb.from('finanzas_resumen_mensual').select('*').order('mes', { ascending: false })
    if (desde) q = q.gte('mes', desde)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    // Es una vista agregada: PostgREST marca todas sus columnas como nulables
    // porque no puede saber que el GROUP BY siempre las llena.
    return (data ?? []) as { mes: string; ingresos_clp: number; egresos_clp: number; saldo_clp: number; movimientos: number }[]
  }
}
