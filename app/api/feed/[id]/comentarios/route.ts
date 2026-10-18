import { NextResponse } from 'next/server'
import { ComentarioInputSchema } from '@/lib/types/feed'
import { cuerpo, feedDeLaSesion, malo } from '@/lib/feed/sesion'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await feedDeLaSesion()
  if ('error' in ctx) return ctx.error
  const parse = ComentarioInputSchema.safeParse(await cuerpo(req))
  if (!parse.success) return malo(parse.error.issues[0]?.message ?? 'Comentario no válido')
  const { id } = await params
  try {
    await ctx.repo.comentar(id, parse.data.texto)
    return NextResponse.json({ success: true, data: null })
  } catch (e) {
    return malo(e instanceof Error ? e.message : 'No se pudo comentar', 500)
  }
}
