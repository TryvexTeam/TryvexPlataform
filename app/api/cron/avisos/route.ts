import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { NotificacionesRepository } from '@/lib/repos/notificaciones'
import { nombreCliente } from '@/lib/types/cliente'
import { diaSantiago } from '@/lib/utils/fecha-santiago'
import { HORAS_MAXIMAS, jornadasParaCerrar } from '@/lib/jornada/cierre-automatico'
import {
  enviarAvisosDeAtraso,
  envioWhatsappEncendido,
  type DestinatarioAviso,
} from '@/lib/avisos/atraso-tareas'

/** Cron diario: entregas de proyecto próximas, cobros pendientes por vencer y
 *  TAREAS ATRASADAS de cada uno. El índice único de dedupe evita repetir el
 *  mismo aviso el mismo día. */
export async function GET(req: Request) {
  // Si falta el secreto se cierra, no se abre. Antes la condición era
  // `if (SECRET && ...)`: sin la variable definida no se pedía nada, y como
  // `proxy.ts` excluye `api/cron` del middleware, no había red debajo —
  // cualquiera podía dispararlo en bucle y llenar de push a todo el equipo.
  // Mismo criterio que `cron/google-watch`.
  const secreto = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secreto || auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const repo = new NotificacionesRepository(admin)
  // "Hoy" se calcula en el calendario de Santiago, no en UTC: a las 20:00 de
  // Santiago el UTC ya cambió de día, y `new Date().toISOString()` corría el
  // cron un día antes o después de lo que un humano en Santiago llamaría
  // "hoy". Mismo patrón que el resto del código (fecha-santiago.ts).
  const hoy = diaSantiago(new Date())
  const en7dias = diaSantiago(new Date(Date.now() + 7 * 86_400_000))
  const en3dias = diaSantiago(new Date(Date.now() + 3 * 86_400_000))
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

  /* ─── Tareas atrasadas, una notificación por persona ──────────────────
   *
   * Nace de lo que dijo Cristian el 11-sep-2026: "mis compañeros de Tryvex no
   * hacen sus tareas —y me incluyo— como que no hay algo que nos obliga". Una
   * tarea vencida el 8 de septiembre hoy sigue ahí, callada, para siempre.
   *
   * Va a la persona, no al grupo: la idea es que se entere, no escracharla.
   * Y un aviso por persona, no uno por tarea: cinco notificaciones seguidas se
   * descartan juntas sin leer ninguna.
   */
  const { data: atrasadas } = await sb
    .from('tareas')
    .select(
      'id, titulo, fecha_limite, tarea_responsables ( integrante_id, dim_integrantes ( nombre, telefono ) )',
    )
    .is('eliminado_at', null)
    .neq('estado', 'listo')
    .not('fecha_limite', 'is', null)
    .lt('fecha_limite', hoy)

  const porPersona = new Map<string, DestinatarioAviso>()
  for (const t of (atrasadas ?? []) as {
    id: string
    titulo: string
    fecha_limite: string
    tarea_responsables: {
      integrante_id: string
      dim_integrantes: { nombre: string | null; telefono: string | null } | null
    }[]
  }[]) {
    // Una tarea sin responsable no se le puede reclamar a nadie. No se pierde:
    // sigue en rojo en el tablero y en el total del equipo de la portada.
    for (const r of t.tarea_responsables ?? []) {
      const actual = porPersona.get(r.integrante_id) ?? {
        integrante_id: r.integrante_id,
        nombre: r.dim_integrantes?.nombre ?? 'Alguien',
        telefono: r.dim_integrantes?.telefono ?? null,
        tareas: [],
      }
      actual.tareas.push({ id: t.id, titulo: t.titulo, fecha_limite: t.fecha_limite })
      porPersona.set(r.integrante_id, actual)
    }
  }

  // La notificación dentro del CRM (y el push al teléfono) sale siempre: no
  // depende del número de WhatsApp, que administra Ignacio.
  for (const d of porPersona.values()) {
    await repo.notificar({
      destinatarios: [d.integrante_id],
      tipo: 'tareas_atrasadas',
      titulo:
        d.tareas.length === 1
          ? 'Tienes 1 tarea pasada de fecha'
          : `Tienes ${d.tareas.length} tareas pasadas de fecha`,
      link: '/tareas',
    })
    enviadas++
  }

  // El WhatsApp va aparte y APAGADO por defecto (`AVISOS_WA=on`): ese número ya
  // se quemó una vez por escribir sin control, y no lo administramos nosotros.
  // Apagado igual corre y deja en la respuesta qué habría mandado a cada uno —
  // eso es lo que se revisa antes de encenderlo.
  const whatsapp = await enviarAvisosDeAtraso([...porPersona.values()])

  /* ─── Jornadas que quedaron abiertas ──────────────────────────────────
   *
   * Irse sin marcar salida no deja un hueco: deja una jornada contando toda la
   * noche, y al día siguiente alguien aparece con 30 horas. Ahí el marcador del
   * equipo deja de significar nada, que es justo el dato con el que se quiere
   * gobernar el trabajo.
   *
   * La salida se pone en entrada + 12 h, NO a la hora en que corre el cron: si
   * entró a las 9 y el cron corre de madrugada, marcarle esa hora le inventaría
   * horas que no trabajó. Con el tope el número es defendible y la persona
   * puede corregirlo a mano.
   */
  const { data: abiertas } = await sb
    .from('jornadas')
    .select('id, integrante_id, entrada_at')
    .is('salida_at', null)

  const paraCerrar = jornadasParaCerrar((abiertas ?? []) as {
    id: string; integrante_id: string; entrada_at: string
  }[])

  for (const c of paraCerrar) {
    const { error } = await sb
      .from('jornadas')
      .update({ salida_at: c.salida_at })
      .eq('id', c.id)
      .is('salida_at', null) // si la cerró la persona mientras tanto, manda la suya
    if (error) continue

    await repo.notificar({
      destinatarios: [c.integrante_id],
      tipo: 'jornada_cerrada',
      titulo: `Te cerramos la jornada a las ${HORAS_MAXIMAS} h — revísala si no era así`,
      link: '/jornada',
    })
    enviadas++
  }

  return NextResponse.json({
    success: true,
    data: {
      avisos: enviadas,
      jornadas_cerradas: paraCerrar.length,
      atrasos: {
        personas: porPersona.size,
        tareas: (atrasadas ?? []).length,
        whatsapp_encendido: envioWhatsappEncendido(),
        whatsapp: whatsapp.map((r) => ({
          nombre: r.nombre,
          tareas: r.tareas,
          estado: r.estado,
          detalle: r.detalle,
        })),
      },
    },
  })
}
