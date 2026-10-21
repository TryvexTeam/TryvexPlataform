import { NextResponse } from 'next/server'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'
import { LoteNoticiasSchema } from '@/lib/types/feed'

/**
 * Un agente (el radar semanal) publica noticias en la pestaña «Afuera» del feed.
 *
 *   POST /api/agentes/noticias
 *   { "noticias": [{ "url": "https://…", "titulo": "…", "resumen": "…", "fuente": "radar semanal" }] }
 *
 * Hasta 30 por llamada. Una noticia cuya url ya está publicada se salta (índice
 * único de la migración 128): el radar puede mandar la semana entera sin duplicar.
 * La vista previa la arma el agente (título y resumen): el servidor no abre links acá.
 */
export async function POST(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error
  const datos = LoteNoticiasSchema.safeParse(leido.cuerpo)
  if (!datos.success) return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')

  let publicadas = 0
  let repetidas = 0
  for (const n of datos.data.noticias) {
    const { error } = await admin.from('publicaciones').insert({
      tipo: 'noticia',
      agente_id: agente.id,
      url: n.url,
      texto: n.resumen ?? null,
      url_titulo: n.titulo,
      url_descripcion: n.resumen ?? null,
      url_sitio: (() => {
        try {
          return new URL(n.url).hostname.replace(/^www\./, '')
        } catch {
          return null
        }
      })(),
      fuente: n.fuente ?? agente.nombre,
    })
    if (!error) publicadas++
    else if (error.code === '23505') repetidas++
    else return NextResponse.json({ success: false, error: `No se pudo publicar «${n.titulo}»: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: { publicadas, repetidas } })
}
