import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { ScraperRepository, YaHayUnaCorriendo } from '@/lib/repos/scraper'
import { FiltrosScraperSchema } from '@/lib/types/scraper'

/**
 * Disparar el scraper de leads desde el CRM.
 *
 * Esta ruta NO ejecuta el scraper: el scraper vive en un VPS porque abre un
 * Chromium de verdad, y eso no entra en una funcion serverless. Acá solo se deja
 * escrito el pedido en `scraper_runs`; el worker del VPS lo levanta a los pocos
 * segundos. El por que de ese diseno esta explicado en la migracion 040.
 *
 * Quien puede: cualquier integrante activo del equipo (decision de Cristian,
 * 9-ago-2026). El limite real es tecnico y no jerarquico -- una corrida a la
 * vez, porque cada una levanta un navegador en el servidor.
 */

async function integranteActivo() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }) }
  }

  const yo = await new PermisosRepository(supabase).misPermisos(user.id)
  if (!yo?.activo) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Tu cuenta no esta activa' },
        { status: 403 },
      ),
    }
  }

  return { supabase, yo }
}

/** Como va la cosa: la corrida viva (si hay) y las ultimas terminadas. */
export async function GET() {
  const auth = await integranteActivo()
  if ('error' in auth) return auth.error

  const repo = new ScraperRepository(auth.supabase)
  try {
    const [activa, historial] = await Promise.all([repo.activa(), repo.historial()])
    return NextResponse.json({ success: true, activa, historial })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'No pude leer el estado' },
      { status: 500 },
    )
  }
}

/** Encolar una corrida con los filtros elegidos. */
export async function POST(req: NextRequest) {
  const auth = await integranteActivo()
  if ('error' in auth) return auth.error

  const cuerpo = await req.json().catch(() => null)
  const filtros = FiltrosScraperSchema.safeParse(cuerpo ?? {})
  if (!filtros.success) {
    return NextResponse.json(
      { success: false, error: filtros.error.issues[0]?.message ?? 'Filtros invalidos' },
      { status: 400 },
    )
  }

  try {
    const corrida = await new ScraperRepository(auth.supabase).encolar(auth.yo.id, filtros.data)
    return NextResponse.json({ success: true, corrida })
  } catch (e) {
    // 409 y no 500: no es una falla, es que otro llego primero. La pantalla lo
    // cuenta distinto -- "ya hay una corriendo" en vez de "algo se rompio".
    if (e instanceof YaHayUnaCorriendo) {
      return NextResponse.json(
        { success: false, error: 'Ya hay una corrida en curso. Espera a que termine.' },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'No pude encolar la corrida' },
      { status: 500 },
    )
  }
}

/** Pedirle que pare. Corta entre categorias, no al instante. */
export async function PATCH(req: NextRequest) {
  const auth = await integranteActivo()
  if ('error' in auth) return auth.error

  const cuerpo = await req.json().catch(() => null)
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : null
  if (!id) {
    return NextResponse.json({ success: false, error: 'Falta el id' }, { status: 400 })
  }

  try {
    const frenada = await new ScraperRepository(auth.supabase).pedirFreno(id)
    if (!frenada) {
      return NextResponse.json(
        { success: false, error: 'Esa corrida ya no esta activa' },
        { status: 409 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'No pude frenarla' },
      { status: 500 },
    )
  }
}
