import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ClienteInsertSchema, nombreCliente } from '@/lib/types/cliente'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const result = ClienteInsertSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  const repo = new ClientesRepository(supabase)
  const id = await repo.create(result.data)

  // Aviso al equipo (excluye a quien lo creó)
  const notif = new NotificacionesRepository(supabase)
  const yo = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  await notif.notificar({
    destinatarios: await notif.idsActivos(),
    tipo: 'nuevo_cliente',
    titulo: `Nuevo cliente: ${nombreCliente(result.data)}`,
    link: `/clientes/${id}`,
    excluir: yo?.id ?? null,
  })

  return NextResponse.json({ id }, { status: 201 })
}
