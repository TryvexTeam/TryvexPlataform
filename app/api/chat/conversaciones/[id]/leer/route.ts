import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ChatRepository } from '@/lib/repos/chat'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const repo = new ChatRepository(supabase)
  if (!(await repo.esMiembro(id, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esa conversación' }, { status: 403 })
  }
  await repo.marcarLeida(id, perfil.id)
  return NextResponse.json({ success: true, data: { leida: true } })
}
