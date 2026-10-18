import 'server-only'

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { FeedRepository } from '@/lib/repos/feed'

/** Repo del feed para quien tiene la sesión, o la respuesta 401 lista para devolver. */
export async function feedDeLaSesion(): Promise<{ repo: FeedRepository } | { error: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }) }
  const yo = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!yo) return { error: NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 }) }
  return { repo: new FeedRepository(supabase, yo.id) }
}

export function malo(mensaje: string, status = 400): NextResponse {
  return NextResponse.json({ success: false, error: mensaje }, { status })
}

export async function cuerpo(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}
