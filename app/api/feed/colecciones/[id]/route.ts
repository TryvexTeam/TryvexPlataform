import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cuerpo, feedDeLaSesion, malo } from '@/lib/feed/sesion'

const Schema = z.object({ publicacionId: z.string().uuid() })

/** Guarda o saca una publicación de la colección. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await feedDeLaSesion()
  if ('error' in ctx) return ctx.error
  const parse = Schema.safeParse(await cuerpo(req))
  if (!parse.success) return malo('Publicación no válida')
  const { id } = await params
  try {
    const guardada = await ctx.repo.alternarEnColeccion(id, parse.data.publicacionId)
    return NextResponse.json({ success: true, data: { guardada } })
  } catch (e) {
    return malo(e instanceof Error ? e.message : 'No se pudo guardar')
  }
}
