import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { BienvenidasRepository } from '@/lib/repos/bienvenidas'
import { ChatRepository } from '@/lib/repos/chat'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import { SaludarSchema } from '@/lib/types/bienvenida'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  const yo = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!yo) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  const parsed = SaludarSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 })
  if (parsed.data.nuevo_id === yo.id) return NextResponse.json({ success: false, error: 'No puedes saludarte a ti mismo' }, { status: 400 })

  try {
    const bienvenidas = new BienvenidasRepository(supabase)
    const nuevo = await bienvenidas.getActivo(parsed.data.nuevo_id)
    if (!nuevo) return NextResponse.json({ success: false, error: 'Ese integrante no existe' }, { status: 404 })
    const { yaSaludado } = await bienvenidas.saludar(nuevo.id, yo.id)
    const chat = new ChatRepository(supabase)
    const conversacionId = await chat.abrirDm(yo.id, nuevo.id)
    if (!yaSaludado) {
      await chat.enviar(conversacionId, yo.id, `¡Bienvenido/a a Tryvex, ${nuevo.nombre.split(' ')[0]}!`)
      await new NotificacionesRepository(supabase).notificar({
        destinatarios: [nuevo.id], tipo: 'bienvenida',
        titulo: `${yo.nombre} te dio la bienvenida`, link: `/chat?c=${conversacionId}`,
      })
    }
    return NextResponse.json({ success: true, data: { conversacion_id: conversacionId, ya_saludado: yaSaludado } })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'No se pudo dar la bienvenida' }, { status: 500 })
  }
}
