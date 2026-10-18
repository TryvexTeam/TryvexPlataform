import { NextResponse } from 'next/server'
import { PublicacionInputSchema } from '@/lib/types/feed'
import { obtenerVistaPrevia } from '@/lib/feed/vista-previa'
import { cuerpo, feedDeLaSesion, malo } from '@/lib/feed/sesion'

/** Publicar en el feed del equipo. Si trae link, se arma su vista previa en el servidor. */
export async function POST(req: Request) {
  const ctx = await feedDeLaSesion()
  if ('error' in ctx) return ctx.error

  const parse = PublicacionInputSchema.safeParse(await cuerpo(req))
  if (!parse.success) return malo(parse.error.issues[0]?.message ?? 'Datos inválidos')

  const { texto, url } = parse.data
  const vista = url ? await obtenerVistaPrevia(url) : { titulo: null, descripcion: null, imagen: null, sitio: null }
  try {
    const id = await ctx.repo.crear(texto, url, vista)
    return NextResponse.json({ success: true, data: { id } })
  } catch (e) {
    return malo(e instanceof Error ? e.message : 'No se pudo publicar', 500)
  }
}
