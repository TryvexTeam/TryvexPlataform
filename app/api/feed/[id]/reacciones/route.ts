import { NextResponse } from 'next/server'
import { ReaccionInputSchema } from '@/lib/types/feed'
import { cuerpo, feedDeLaSesion, malo } from '@/lib/feed/sesion'

/** Pone o saca una reacción. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await feedDeLaSesion()
  if ('error' in ctx) return ctx.error
  const parse = ReaccionInputSchema.safeParse(await cuerpo(req))
  if (!parse.success) return malo('Reacción no válida')
  const { id } = await params
  try {
    const puesta = await ctx.repo.alternarReaccion(id, parse.data.emoji)
    return NextResponse.json({ success: true, data: { puesta } })
  } catch (e) {
    return malo(e instanceof Error ? e.message : 'No se pudo reaccionar', 500)
  }
}
