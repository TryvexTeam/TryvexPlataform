import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ChatRepository } from '@/lib/repos/chat'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ActualizarMiembroSchema } from '@/lib/types/chat'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  const parsed = ActualizarMiembroSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const repo = new ChatRepository(supabase)
  if (!(await repo.esMiembro(id, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esa conversación' }, { status: 403 })
  }
  if (parsed.data.fijado && (await repo.contarFijadas(perfil.id, id)) >= 3) {
    return NextResponse.json({ success: false, error: 'Solo puedes fijar hasta 3 chats' }, { status: 400 })
  }

  const ahora = new Date().toISOString()
  const cambios: Record<string, string | null> = {}
  if (parsed.data.fijado !== undefined) cambios.fijado_at = parsed.data.fijado ? ahora : null
  if (parsed.data.archivado !== undefined) cambios.archivado_at = parsed.data.archivado ? ahora : null
  if (parsed.data.silenciado_hasta !== undefined) cambios.silenciado_hasta = parsed.data.silenciado_hasta
  if (parsed.data.no_leido) {
    const ultimo = await repo.fechaUltimoMensaje(id)
    cambios.ultimo_leido_at = ultimo
      ? new Date(new Date(ultimo).getTime() - 1).toISOString()
      : ahora
  }

  await repo.actualizarMiembro(id, perfil.id, cambios)
  return NextResponse.json({ success: true, data: cambios })
}
