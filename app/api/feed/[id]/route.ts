import { NextResponse } from 'next/server'
import { feedDeLaSesion, malo } from '@/lib/feed/sesion'

/** Borra (suave) una publicación propia. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await feedDeLaSesion()
  if ('error' in ctx) return ctx.error
  const { id } = await params
  try {
    const borrada = await ctx.repo.borrar(id)
    if (!borrada) return malo('Solo puedes borrar lo que publicaste tú', 403)
    return NextResponse.json({ success: true, data: null })
  } catch (e) {
    return malo(e instanceof Error ? e.message : 'No se pudo borrar', 500)
  }
}
