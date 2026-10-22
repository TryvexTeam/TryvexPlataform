import { NextResponse } from 'next/server'
import { autenticarAgente } from '@/lib/agentes/autenticar'

/**
 * Lo que el equipo publicó y guardó en el feed, para que los agentes lo tomen como
 * ideas («así te doy nuevas ideas», Cristian, 18-oct).
 *
 *   GET /api/agentes/feed?desde=2026-10-01T00:00:00Z&coleccion=<nombre>
 *
 * Solo lectura y solo posts del equipo (no las noticias, que ya vienen de agentes).
 * Con `coleccion`, solo lo guardado en esa colección (por nombre, sin importar mayúsculas).
 */
export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const params = new URL(req.url).searchParams
  const desde = params.get('desde')
  const nombreColeccion = params.get('coleccion')

  let ids: string[] | null = null
  if (nombreColeccion) {
    const { data: col } = await admin.from('colecciones').select('id').ilike('nombre', nombreColeccion).maybeSingle()
    if (!col) return NextResponse.json({ success: true, data: { publicaciones: [] } })
    const { data: items } = await admin.from('coleccion_items').select('publicacion_id').eq('coleccion_id', col.id)
    ids = ((items ?? []) as { publicacion_id: string }[]).map((i) => i.publicacion_id)
    if (ids.length === 0) return NextResponse.json({ success: true, data: { publicaciones: [] } })
  }

  let q = admin
    .from('publicaciones')
    .select('id, texto, url, url_titulo, url_descripcion, created_at, autor:dim_integrantes!publicaciones_autor_id_fkey (nombre)')
    .eq('tipo', 'post')
    .is('eliminado_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (desde && !Number.isNaN(Date.parse(desde))) q = q.gte('created_at', desde)
  if (ids) q = q.in('id', ids)

  const { data, error } = await q
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const { data: colecciones } = await admin.from('colecciones').select('nombre').order('nombre')
  return NextResponse.json({
    success: true,
    data: {
      publicaciones: data ?? [],
      colecciones: ((colecciones ?? []) as { nombre: string }[]).map((c) => c.nombre),
    },
  })
}
