import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import type { Llamada, ParticipanteLlamada } from '@/lib/types/llamada'

export const dynamic = 'force-dynamic'

/**
 * Todas las llamadas vivas de mis conversaciones, con quién está adentro.
 *
 * Es una sola consulta y no una por canal: la bandeja muestra varias salas a la
 * vez y preguntar de a una sería una tanda de peticiones cada vez que alguien
 * entra o sale. La RLS ya recorta a lo que uno puede ver.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const { data: llamadas, error } = await supabase
    .from('llamadas')
    .select('*')
    .neq('estado', 'terminada')

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const vivas = (llamadas ?? []) as Llamada[]
  if (vivas.length === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const { data: participantes } = await supabase
    .from('llamada_participantes')
    .select('*')
    .in('llamada_id', vivas.map((l) => l.id))
    .eq('estado', 'en_llamada')

  const porLlamada = new Map<string, string[]>()
  for (const p of (participantes ?? []) as ParticipanteLlamada[]) {
    porLlamada.set(p.llamada_id, [...(porLlamada.get(p.llamada_id) ?? []), p.integrante_id])
  }

  return NextResponse.json({
    success: true,
    data: vivas.map((l) => ({
      llamada: l,
      dentro: porLlamada.get(l.id) ?? [],
    })),
  })
}
