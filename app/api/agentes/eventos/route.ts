import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { EventosRepository } from '@/lib/repos/eventos'
import { EventoInsertSchema } from '@/lib/types/evento'
import { crearEventoEnGoogle } from '@/lib/google/calendar-write'

/**
 * Agendar desde un agente.
 *
 * Mismo trabajo que `POST /api/eventos`, pero autenticado con token de agente en
 * vez de sesión de navegador: Jarvis, Ariel y Spike corren como servicios y no
 * pueden pasar por el login (es el mismo motivo por el que existe
 * `/api/agentes/mensajes`).
 *
 * Nace de un caso concreto: Emili, el agente de WhatsApp que atiende el número
 * comercial, cierra la conversación agendando. Sin esta puerta tenía que hablar
 * con Google por su cuenta, y entonces la reunión existía en el calendario pero
 * NO en el CRM, y el correo de confirmación era una copia aparte de la plantilla
 * de `lib/email/cita.ts` que se iba a quedar vieja al primer cambio de diseño.
 *
 * Reutiliza sin tocar: EventosRepository, crearEventoEnGoogle y enviarEmailCita.
 * El único añadido es de quién es el evento — un agente no es integrante, así
 * que se le atribuye al integrante que lo dio de alta (`agentes.creado_por`).
 *
 * Usa service role a propósito: no hay sesión que representar. El permiso lo da
 * el token.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface Agente {
  id: string
  nombre: string
  creado_por: string | null
  token_hash: string
  expira_at: string | null
}

/** Devuelve el agente del token, o null. Nunca dice cuál de las dos cosas falló. */
async function autenticar(req: Request): Promise<Agente | null> {
  const token = tokenDeCabecera(req)
  if (!token) return null

  const admin = createAdminClient() as SB
  const { data } = await admin.from('agentes').select('*').eq('activo', true)

  // Se recorren todos y se compara el hash: buscar por hash directo sería más
  // rápido, pero entonces la consulta misma revelaría si el token existe.
  const agente = ((data ?? []) as Agente[]).find((a) => tokenCoincide(token, a.token_hash))
  if (!agente || tokenExpirado(agente.expira_at)) return null

  await admin.from('agentes').update({ ultimo_uso_at: new Date().toISOString() }).eq('id', agente.id)
  return agente
}

/**
 * Ya existe un evento igual (mismo título y mismo inicio).
 *
 * Un agente reintenta cuando se le corta la red, y sin esto un reintento
 * agendaría dos veces la misma llamada. No hay columna de idempotencia en
 * `eventos`, así que se usa la pareja título+inicio, que para una cita es única.
 */
async function eventoYaExiste(admin: SB, titulo: string, inicio: string): Promise<string | null> {
  const { data } = await admin
    .from('eventos')
    .select('id')
    .eq('titulo', titulo)
    .eq('inicio', inicio)
    .maybeSingle()
  return (data?.id as string) ?? null
}

export async function POST(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo) return NextResponse.json({ success: false, error: 'Cuerpo inválido' }, { status: 400 })

  const result = EventoInsertSchema.safeParse(cuerpo)
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  // Un agente no es integrante: el evento se atribuye a quien lo dio de alta.
  const creadoPor = agente.creado_por
  if (!creadoPor) {
    return NextResponse.json(
      {
        success: false,
        error: `El agente "${agente.nombre}" no tiene integrante asociado (agentes.creado_por en null): no se le puede atribuir el evento`,
      },
      { status: 409 },
    )
  }

  const admin = createAdminClient() as SB

  const yaExiste = await eventoYaExiste(admin, result.data.titulo, result.data.inicio)
  if (yaExiste) {
    return NextResponse.json({
      success: true,
      data: { id: yaExiste, meet_link: null, google_sync: false, duplicado: true },
    })
  }

  const repo = new EventosRepository(admin)

  let id: string
  try {
    id = await repo.create(result.data, creadoPor)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error creando el evento'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }

  // Espejo en Google Calendar con Meet e invitaciones. Best-effort:
  // si Google falla, el evento vive igual en el CRM.
  let meetLink: string | null = null
  let googleOk = false
  try {
    const asistentesIds =
      result.data.asistentes_ids.length > 0 ? result.data.asistentes_ids : [creadoPor]
    const emails = await repo.emailsDeIntegrantes(asistentesIds)
    const g = await crearEventoEnGoogle({
      titulo: result.data.titulo,
      inicio: result.data.inicio,
      fin: result.data.fin,
      notas: result.data.notas ?? null,
      invitadosEmails: [...emails, ...result.data.invitados_externos],
    })
    await repo.setGoogleData(id, g)
    meetLink = g.meet_link
    googleOk = true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error creando en Google'
    console.error('[agentes/eventos POST → google]', message)
  }

  // Aviso in-app a los asistentes internos. El agente no excluye a nadie: no es
  // integrante, así que todos los asistentes deben enterarse.
  try {
    const { NotificacionesRepository } = await import('@/lib/repos/notificaciones')
    const hora = new Date(result.data.inicio).toLocaleString('es-CL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Santiago',
    })
    const destinatarios =
      result.data.asistentes_ids.length > 0 ? result.data.asistentes_ids : [creadoPor]
    await new NotificacionesRepository(admin).notificar({
      destinatarios,
      tipo: 'cita_invitado',
      titulo: `Cita: ${result.data.titulo}`,
      cuerpo: `${hora} · agendada por ${agente.nombre}`,
      link: '/reuniones',
    })
  } catch (error: unknown) {
    console.error(
      '[agentes/eventos POST → notificaciones]',
      error instanceof Error ? error.message : error,
    )
  }

  // Confirmación con template Tryvex a los invitados externos. Best-effort.
  if (result.data.invitados_externos.length > 0) {
    try {
      const { enviarEmailCita } = await import('@/lib/email/cita')
      await enviarEmailCita({
        emails: result.data.invitados_externos,
        titulo: result.data.titulo,
        inicio: result.data.inicio,
        meetLink,
      })
    } catch (error: unknown) {
      console.error(
        '[agentes/eventos POST → email cita]',
        error instanceof Error ? error.message : error,
      )
    }
  }

  return NextResponse.json(
    { success: true, data: { id, meet_link: meetLink, google_sync: googleOk } },
    { status: 201 },
  )
}
