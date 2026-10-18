import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EventosRepository } from '@/lib/repos/eventos'
import { GoogleSyncRepository } from '@/lib/repos/google-sync'
import { syncIncremental } from '@/lib/google/calendar-sync'

/**
 * Compara el token recibido contra el esperado sin filtrar por timing.
 * Mismo patrón que `secretValido` en app/api/webhook/scraper/route.ts:
 * `!==` corta en el primer byte distinto y deja medir por timing cuántos
 * caracteres acertó un atacante; `timingSafeEqual` explota si los buffers
 * tienen largo distinto, así que ese caso se descarta antes sin comparar.
 */
function tokenValido(recibido: string | null): boolean {
  const esperado = process.env.GOOGLE_WEBHOOK_TOKEN
  if (!recibido || !esperado) return false
  const bufRecibido = Buffer.from(recibido)
  const bufEsperado = Buffer.from(esperado)
  if (bufRecibido.length !== bufEsperado.length) return false
  return timingSafeEqual(bufRecibido, bufEsperado)
}

// Push notifications de Google Calendar (events.watch).
// Google NO manda el evento en el body — la notificación solo gatilla el sync incremental.
export async function POST(req: Request) {
  const token = req.headers.get('x-goog-channel-token')
  if (!tokenValido(token)) {
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
