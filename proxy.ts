import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // sw.js, manifest y offline.html quedan fuera: el navegador los pide sin sesión
    // (el service worker se registra antes del login y debe responder 200, no 307).
    '/((?!_next/static|_next/image|favicon.ico|api/webhook|api/cron|sw\\.js|offline\\.html|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
