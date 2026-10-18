import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { EventosRepository } from '@/lib/repos/eventos'
import { AsignacionesRepository } from '@/lib/repos/asignaciones'

/**
 * Auto-asignación a citas (PRP-008 F4).
 *
 * El integrante autenticado se suma o se quita él mismo de un evento.
 * La RLS de `eventos_asistentes` (migración 051) exige que el insert/delete
 * sea sobre la propia fila — aquí nunca se asigna a otro.
 */

type Sesion =
  | { supabase: Awaited<ReturnType<typeof createClient>>; integranteId: string }
  | { errorResponse: NextResponse }

async function sesionIntegrante(): Promise<Sesion> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      errorResponse: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }),
    }
  }
  const integranteId = await new EventosRepository(supabase).integranteIdDe(user.id)
  if (!integranteId) {
    return {
      errorResponse: NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 }),
    }
  }
  return { supabase, integranteId }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sesionIntegrante()
  if ('errorResponse' in s) return s.errorResponse

  const { id } = await params
  try {
    await new AsignacionesRepository(s.supabase).autoAsignarseEvento(id, s.integranteId)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al asignarse al evento'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: { evento_id: id, integrante_id: s.integranteId },
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sesionIntegrante()
  if ('errorResponse' in s) return s.errorResponse

  const { id } = await params
  try {
    await new AsignacionesRepository(s.supabase).quitarseDeEvento(id, s.integranteId)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al quitarse del evento'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
