import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EventosRepository } from '@/lib/repos/eventos'
import { GoogleSyncRepository } from '@/lib/repos/google-sync'
import { syncIncremental } from '@/lib/google/calendar-sync'

// Push notifications de Google Calendar (events.watch).
// Google NO manda el evento en el body — la notificación solo gatilla el sync incremental.
export async function POST(req: Request) {
  const token = req.headers.get('x-goog-channel-token')
  if (!token || token !== process.env.GOOGLE_WEBHOOK_TOKEN) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  // Estado inicial del canal — confirmar sin sincronizar
  const resourceState = req.headers.get('x-goog-resource-state')
  if (resourceState === 'sync') {
    return NextResponse.json({ success: true, data: { skipped: 'sync handshake' } })
  }

  // Webhook usa service role key — no hay sesión de usuario
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventosRepo = new EventosRepository(supabase as any)
  const syncRepo = new GoogleSyncRepository(supabase)

  try {
    const result = await syncIncremental(eventosRepo, syncRepo)
    return NextResponse.json({ success: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error de sync'
    console.error('[google-calendar webhook]', message)
    // 200 igual: si respondemos 5xx Google reintenta en ráfaga y no aporta
    return NextResponse.json({ success: false, error: message })
  }
}
