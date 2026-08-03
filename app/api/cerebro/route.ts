import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { CerebroRepository } from '@/lib/repos/cerebro'
import { CrearNotaSchema, FiltroBitacoraSchema } from '@/lib/types/cerebro'

/** Bitácora filtrable: ?entidad_tipo=&entidad_id=&fuente=&buscar=&limite= */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = FiltroBitacoraSchema.safeParse(params)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Filtro inválido' },
      { status: 400 },
    )
  }

  const entradas = await new CerebroRepository(supabase).listEntradas(parsed.data)
  return NextResponse.json({ success: true, data: entradas })
}

/** Nota manual en la bitácora. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = CrearNotaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Nota inválida' },
      { status: 400 },
    )
  }

  try {
    const entrada = await new CerebroRepository(supabase).crearNota(perfil.id, parsed.data)
    return NextResponse.json({ success: true, data: entrada })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error guardando la nota' },
      { status: 500 },
    )
  }
}
