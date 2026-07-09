import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EventosRepository } from '@/lib/repos/eventos'
import { EventoInsertSchema } from '@/lib/types/evento'
import { crearEventoEnGoogle } from '@/lib/google/calendar-write'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const desde = url.searchParams.get('desde')
  const hasta = url.searchParams.get('hasta')
  if (!desde || !hasta) {
    return NextResponse.json({ success: false, error: 'Faltan params desde/hasta' }, { status: 400 })
  }

  const repo = new EventosRepository(supabase)
  const data = await repo.listRango(desde, hasta, user.id)
  return NextResponse.json({ success: true, data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const result = EventoInsertSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues }, { status: 400 })
  }

  const repo = new EventosRepository(supabase)
  const integranteId = await repo.integranteIdDe(user.id)
  if (!integranteId) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const id = await repo.create(result.data, integranteId)

  // Espejo en Google Calendar con Meet e invitaciones. Best-effort:
  // si Google falla, el evento vive igual en el CRM.
  let meetLink: string | null = null
  let googleOk = false
  try {
    const asistentesIds = result.data.asistentes_ids.length > 0
      ? result.data.asistentes_ids
      : [integranteId]
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
    console.error('[eventos POST → google]', message)
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
      console.error('[eventos POST → email cita]', error instanceof Error ? error.message : error)
    }
  }

  return NextResponse.json(
    { success: true, data: { id, meet_link: meetLink, google_sync: googleOk } },
    { status: 201 }
  )
}
