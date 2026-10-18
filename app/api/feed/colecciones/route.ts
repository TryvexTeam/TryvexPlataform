import { NextResponse } from 'next/server'
import { ColeccionInputSchema } from '@/lib/types/feed'
import { cuerpo, feedDeLaSesion, malo } from '@/lib/feed/sesion'

export async function POST(req: Request) {
  const ctx = await feedDeLaSesion()
  if ('error' in ctx) return ctx.error
  const parse = ColeccionInputSchema.safeParse(await cuerpo(req))
  if (!parse.success) return malo(parse.error.issues[0]?.message ?? 'Nombre no válido')
  try {
    const id = await ctx.repo.crearColeccion(parse.data.nombre)
    return NextResponse.json({ success: true, data: { id } })
  } catch (e) {
    return malo(e instanceof Error ? e.message : 'No se pudo crear la colección')
  }
}
