import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PresenciaIntegrante } from '@/lib/types/presencia'

/**
 * Disponibilidad del equipo, derivada del turno marcado y del calendario.
 * El cruce lo hace la vista `presencia_equipo` (migración 024).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('presencia_equipo')
    .select('*')
    .eq('es_del_equipo', true)
    .order('nombre')

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, data: (data ?? []) as PresenciaIntegrante[] })
}
