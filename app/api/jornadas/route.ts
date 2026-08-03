import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { JornadasRepository } from '@/lib/repos/jornadas'
import { MarcarSchema, type OrigenJornada } from '@/lib/types/jornada'

const ERRORES: Record<string, { mensaje: string; status: number }> = {
  jornada_ya_abierta: { mensaje: 'Ya tienes una jornada abierta', status: 409 },
  sin_jornada_abierta: { mensaje: 'No tienes una jornada abierta', status: 409 },
  ya_en_pausa: { mensaje: 'Ya estás en pausa', status: 409 },
  no_esta_en_pausa: { mensaje: 'No estás en pausa', status: 409 },
}

/** Estado actual: la jornada abierta (o null) del integrante autenticado. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const abierta = await new JornadasRepository(supabase).getAbierta(perfil.id)
  return NextResponse.json({ success: true, data: abierta })
}

/** Marca entrada, salida, pausa o reanudación. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = MarcarSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Acción inválida' }, { status: 400 })

  const ua = req.headers.get('user-agent') ?? ''
  const origen: OrigenJornada = /Mobile|Android|iPhone/i.test(ua) ? 'movil' : 'web'
  const repo = new JornadasRepository(supabase)

  try {
    const { accion, nota } = parsed.data
    const jornada =
      accion === 'entrada'  ? await repo.marcarEntrada(perfil.id, origen, nota)
      : accion === 'salida' ? await repo.marcarSalida(perfil.id, nota)
      : accion === 'pausa'  ? await repo.pausar(perfil.id)
      :                       await repo.reanudar(perfil.id)

    return NextResponse.json({ success: true, data: jornada })
  } catch (err) {
    const clave = err instanceof Error ? err.message : ''
    const conocido = ERRORES[clave]
    if (conocido) return NextResponse.json({ success: false, error: conocido.mensaje }, { status: conocido.status })
    return NextResponse.json({ success: false, error: clave || 'Error al marcar' }, { status: 500 })
  }
}
