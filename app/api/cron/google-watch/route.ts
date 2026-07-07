import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleSyncRepository } from '@/lib/repos/google-sync'
import { renewIfNeeded } from '@/lib/google/watch'

// Vercel cron diario: renueva el canal watch antes de que expire.
// Vercel Cron manda header `authorization: Bearer <CRON_SECRET>`.
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  // Fallback: invocación manual con header directo
  return req.headers.get('x-cron-secret') === secret
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const syncRepo = new GoogleSyncRepository(supabase)

  try {
    const result = await renewIfNeeded(syncRepo)
    return NextResponse.json({ success: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error renovando canal'
    console.error('[cron google-watch]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
