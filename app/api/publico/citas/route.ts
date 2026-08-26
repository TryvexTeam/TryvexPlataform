import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CitasRepository, RechazoDeReserva } from '@/lib/repos/citas'
import { ReservaCitaSchema, type ReservaConfirmada } from '@/lib/types/cita'
import { DURACION_CITA_MIN } from '@/lib/types/disponibilidad'
import { crearEventoEnGoogle } from '@/lib/google/calendar-write'

/**
 * Reserva una cita desde el formulario de tryvex.tech.
 *
 * Da vuelta el flujo que había: antes la landing creaba el evento en Google,
 * mandaba los correos, y recién al final disparaba un fire-and-forget a un
 * dashboard externo — la cita nacía fuera del CRM y entraba por la puerta de
 * atrás. Acá la cita nace dentro: lead + evento + asistente + registro de la
 * reserva en una sola transacción (el RPC de la migración 091), y la landing
 * queda con lo suyo: validar el formulario y mandar los correos con lo que este
 * endpoint le devuelve.
 *
 * Efecto lateral que se busca: la cita queda como lead en el kanban desde el
 * segundo cero y con dueño asignado, en vez de existir solo en una bandeja de
 * correo.
 */
function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.LANDING_API_TOKEN
  if (!recibido || !esperado) return false
  const bufRecibido = Buffer.from(recibido)
  const bufEsperado = Buffer.from(esperado)
  if (bufRecibido.length !== bufEsperado.length) return false
  return timingSafeEqual(bufRecibido, bufEsperado)
}

export async function POST(req: Request) {
  if (!secretoValido(req.headers.get('x-landing-token'))) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  let crudo: unknown
  try {
    crudo = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parseo = ReservaCitaSchema.safeParse(crudo)
  if (!parseo.success) {
    return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 422 })
  }
  const datos = parseo.data

  // La IP la pone el proxy, no el cliente. Se toma la primera de la cadena,
  // que es la del origen real cuando el proxy es de confianza.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = req.headers.get('user-agent')?.slice(0, 180) ?? null

  const repo = new CitasRepository(createAdminClient())

  try {
    // El freno se cobra sobre solicitudes ya validadas: contarlo antes
    // castigaría a quien se equivoca escribiendo, y quien abusa no se equivoca.
    if (ip && (await repo.superaElLimite(ip))) {
      return NextResponse.json(
        { success: false, error: 'Demasiadas solicitudes' },
        { status: 429 }
      )
    }

    const reserva = await repo.reservar({
      inicio: datos.inicio,
      nombre: datos.nombre,
      email: datos.email,
      telefono: datos.telefono,
      mensaje: datos.mensaje,
      consentimientoVersion: datos.consentimiento_version,
      ip,
      userAgent,
    })

    /* El evento de Google va DESPUÉS de que la cita ya está guardada, y a
       propósito no es parte de la transacción: si Google falla, la reserva
       sigue en pie y el equipo la ve en el CRM. Al revés —Google primero— una
       caída de su API dejaría al visitante sin cita habiéndole dicho que sí.

       Y el visitante NO va como invitado del evento: Google le mandaría la
       invitación desde la cuenta del negocio, lo que convierte el formulario en
       un amplificador de correo hacia cualquier dirección que alguien escriba,
       con la identidad de Tryvex y sin más esfuerzo que repetirlo. El enlace de
       Meet le llega por Resend desde la landing, que ya tiene su propio freno.
       Al calendario solo se invita a quien atiende. */
    let meetLink: string | null = null
    try {
      const emailInterno = await repo.emailDeIntegrante(reserva.integrante_id)
      const fin = new Date(new Date(datos.inicio).getTime() + DURACION_CITA_MIN * 60000)
      const google = await crearEventoEnGoogle({
        titulo: `Llamada Tryvex — ${datos.nombre}`,
        inicio: datos.inicio,
        fin: fin.toISOString(),
        notas: datos.mensaje ?? null,
        invitadosEmails: emailInterno ? [emailInterno] : [],
      })
      meetLink = google.meet_link
      await repo.guardarGoogleEnEvento(reserva.evento_id, google.google_event_id)
    } catch (err) {
      // No se propaga: la cita ya existe. Queda el registro para que alguien
      // cree el Meet a mano, en vez de perder la reserva por esto.
      console.error('[/api/publico/citas] evento de Google', reserva.evento_id, err)
    }

    const respuesta: ReservaConfirmada = {
      evento_id: reserva.evento_id,
      lead_id: reserva.lead_id,
      integrante_nombre: reserva.integrante_nombre,
      meet_link: meetLink,
    }
    return NextResponse.json({ success: true, data: respuesta })
  } catch (err) {
    /* Un rechazo mudo es indiagnosticable: si se rechaza, se explica. Los tres
       motivos que levanta el RPC son distintos para quien reserva —la hora se
       ocupó, la hora no se ofrece, es demasiado sobre la hora— y merecen
       mensajes distintos en el formulario. */
    if (err instanceof RechazoDeReserva) {
      const status = err.motivo === 'slot_no_disponible' ? 409 : 422
      return NextResponse.json({ success: false, error: err.motivo }, { status })
    }
    // El detalle al log: los mensajes de Postgres nombran tablas y columnas.
    console.error('[/api/publico/citas]', err)
    return NextResponse.json(
      { success: false, error: 'No se pudo reservar la cita' },
      { status: 503 }
    )
  }
}
