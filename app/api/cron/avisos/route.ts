import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import { nombreCliente } from '@/lib/types/cliente'

/** Cron diario: entregas de proyecto próximas + cobros pendientes por vencer.
 *  El índice único de dedupe evita repetir el mismo aviso el mismo día. */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const repo = new NotificacionesRepository(admin)
  const hoy = new Date().toISOString().slice(0, 10)
  const en7dias = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const en3dias = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  let enviadas = 0

  // Entregas de proyecto en <= 7 días (aviso al responsable; sin responsable → a todos)
  const { data: proyectos } = await sb
    .from('dim_proyectos')
    .select('id, nombre, fecha_entrega, responsable_id')
    .gte('fecha_entrega', hoy)
    .lte('fecha_entrega', en7dias)
    .not('estado', 'in', '("entregado","cerrado")')

  const todos = await repo.idsActivos()
  for (const p of (proyectos ?? []) as { id: string; nombre: string; fecha_entrega: string; responsable_id: string | null }[]) {
    const dias = Math.round((new Date(p.fecha_entrega).getTime() - Date.now()) / 86_400_000)
    await repo.notificar({
      destinatarios: p.responsable_id ? [p.responsable_id] : todos,
      tipo: 'entrega_proxima',
      titulo: `Entrega de "${p.nombre}" en ${dias <= 0 ? 'HOY' : `${dias} día${dias === 1 ? '' : 's'}`}`,
      link: `/proyectos/${p.id}`,
    })
    enviadas++
  }

  // Cobros pendientes con fecha de cobro en <= 3 días (o vencidos) — aviso a todos
  const { data: cobros } = await sb
    .from('fact_ventas')
    .select('id, monto_usd, fecha_vencimiento, cliente_id, dim_clientes ( nombre_contacto, nombre_negocio )')
    .in('estado_pago', ['pendiente', 'atrasado'])
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', en3dias)

  for (const v of (cobros ?? []) as {
    id: string; monto_usd: number | null; fecha_vencimiento: string; cliente_id: string | null
    dim_clientes: { nombre_contacto: string | null; nombre_negocio: string | null } | null
  }[]) {
    const cliente = v.dim_clientes ? nombreCliente(v.dim_clientes) : 'cliente'
    const vencido = v.fecha_vencimiento < hoy
    await repo.notificar({
      destinatarios: todos,
      tipo: 'cobro_proximo',
      titulo: `${vencido ? 'Cobro VENCIDO' : 'Cobro próximo'}: $${(v.monto_usd ?? 0).toLocaleString()} de ${cliente}`,
      link: v.cliente_id ? `/clientes/${v.cliente_id}` : undefined,
    })
    enviadas++
  }

  return NextResponse.json({ success: true, data: { avisos: enviadas } })
}
