import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { DisponibilidadRepository } from '@/lib/repos/disponibilidad'
import { SlotsPublicosQuerySchema } from '@/lib/types/disponibilidad'
import { diaSantiago } from '@/lib/utils/fecha-santiago'

/**
 * Horas reservables para el formulario de citas de tryvex.tech.
 *
 * Lo llama el SERVIDOR de la landing, nunca su navegador. De ahí las dos
 * decisiones que más forma le dan a esta ruta:
 *
 *   · No se emiten cabeceras CORS. El día que el navegador pueda llamarla, el
 *     secreto vive en el navegador y deja de ser un secreto.
 *   · Se responde con slots anónimos. Ver `SlotPublico` en lib/types: publicar
 *     los huecos publica lo ocupado por diferencia, y con identidad eso es la
 *     agenda del equipo servida a cualquiera que la muestree.
 *
 * El secreto autentica al servidor de la landing, no al visitante, así que no
 * es la única defensa: el horizonte está acotado a 14 días por schema y la
 * respuesta no lleva identidad ni conteos aunque el token se filtre.
 */
function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.LANDING_API_TOKEN
  if (!recibido || !esperado) return false
  const bufRecibido = Buffer.from(recibido)
  const bufEsperado = Buffer.from(esperado)
  // timingSafeEqual explota con largos distintos; ese caso se descarta antes
  // sin comparar, igual que en /api/webhook/scraper.
  if (bufRecibido.length !== bufEsperado.length) return false
  return timingSafeEqual(bufRecibido, bufEsperado)
}

export async function GET(req: Request) {
  if (!secretoValido(req.headers.get('x-landing-token'))) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const parseo = SlotsPublicosQuerySchema.safeParse({
    desde: searchParams.get('desde') ?? undefined,
    dias: searchParams.get('dias') ?? undefined,
  })
  if (!parseo.success) {
    return NextResponse.json(
      { success: false, error: parseo.error.issues[0]?.message ?? 'Parámetros inválidos' },
      { status: 400 }
    )
  }

  // Nunca antes de hoy: pedir el pasado no tiene sentido y además permitiría
  // barrer el historial de ocupación del equipo hacia atrás.
  const hoy = diaSantiago(new Date())
  const desde = parseo.data.desde && parseo.data.desde > hoy ? parseo.data.desde : hoy

  try {
    const repo = new DisponibilidadRepository(createAdminClient())
    const data = await repo.slotsPublicos(desde, parseo.data.dias)
    return NextResponse.json(
      { success: true, data },
      {
        // Cinco minutos: suficiente para que el muestreo fino no sirva de
        // sonda, y poco para que una hora recién ocupada desaparezca pronto.
        headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
      }
    )
  } catch (err) {
    // El detalle al log, nunca al cliente: los mensajes de Postgres nombran
    // tablas y columnas.
    console.error('[/api/publico/disponibilidad]', err)
    return NextResponse.json(
      { success: false, error: 'No se pudo calcular la disponibilidad' },
      { status: 503 }
    )
  }
}
