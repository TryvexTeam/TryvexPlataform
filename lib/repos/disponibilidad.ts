import { createClient } from '@/lib/supabase/server'
import type { Celda, DisponibilidadIntegrante } from '@/lib/types/disponibilidad'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface CeldaRow {
  integrante_id: string
  dia_semana: number
  hora: number
}

interface IntegranteRow {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  auth_user_id: string | null
}

export class DisponibilidadRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Disponibilidad de todos los integrantes activos, marcando la propia del usuario actual */
  async listAll(authUserId: string): Promise<DisponibilidadIntegrante[]> {
    const [{ data: integrantes, error: e1 }, { data: celdas, error: e2 }] = await Promise.all([
      this.sb
        .from('dim_integrantes')
        .select('id, nombre, avatar_url, color, auth_user_id')
        .eq('activo', true)
        .order('nombre'),
      this.sb
        .from('disponibilidad')
        .select('integrante_id, dia_semana, hora'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    const porIntegrante = new Map<string, Celda[]>()
    for (const c of (celdas ?? []) as CeldaRow[]) {
      const arr = porIntegrante.get(c.integrante_id) ?? []
      arr.push({ dia_semana: c.dia_semana, hora: c.hora })
      porIntegrante.set(c.integrante_id, arr)
    }

    return ((integrantes ?? []) as IntegranteRow[]).map((i) => ({
      integrante_id: i.id,
      nombre: i.nombre,
      avatar_url: i.avatar_url,
      color: i.color,
      es_propio: i.auth_user_id === authUserId,
      celdas: porIntegrante.get(i.id) ?? [],
    }))
  }

  /** Reemplaza por completo la disponibilidad del integrante (guardado idempotente desde la grilla) */
  async replaceOwn(integranteId: string, celdas: Celda[]): Promise<void> {
    const { error: delError } = await this.sb
      .from('disponibilidad')
      .delete()
      .eq('integrante_id', integranteId)
    if (delError) throw new Error(delError.message)

    if (celdas.length === 0) return

    const rows = celdas.map((c) => ({
      integrante_id: integranteId,
      dia_semana: c.dia_semana,
      hora: c.hora,
    }))
    const { error: insError } = await this.sb.from('disponibilidad').insert(rows)
    if (insError) throw new Error(insError.message)
  }

  /** id del integrante asociado al usuario auth actual (null si no es integrante activo) */
  async integranteIdDe(authUserId: string): Promise<string | null> {
    const { data } = await this.sb
      .from('dim_integrantes')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('activo', true)
      .single()
    return data?.id ?? null
  }
}
