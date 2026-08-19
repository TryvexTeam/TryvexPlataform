import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'
import { EstadoTareaSchema } from '@/lib/types/tarea'

/**
 * El estado sale de `EstadoTareaSchema`, no de una lista repetida aquí.
 *
 * Esta ruta enumeraba a mano los tres estados viejos, así que al ampliar el
 * tablero a cinco columnas rechazaba con 400 cualquier arrastre a "Backlog" o
 * "En revisión": la tarjeta se movía en pantalla, el guardado fallaba y volvía
 * a su sitio. Enganchada al esquema, no puede volver a desincronizarse.
 */
const EstadoSchema = z.object({
  estado: EstadoTareaSchema,
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = EstadoSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 })
  }

  const repo = new TareasRepository(supabase)
  await repo.cambiarEstado(id, result.data.estado)
  return NextResponse.json({ ok: true })
}
