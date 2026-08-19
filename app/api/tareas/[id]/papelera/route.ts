import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'
import { EstadoTareaSchema } from '@/lib/types/tarea'

const PapeleraSchema = z.object({
  accion: z.enum(['mover', 'restaurar']),
  // Del esquema y no repetida aquí: enumerarla a mano fue lo que dejó la
  // ruta de estado rechazando las columnas nuevas con un 400.
  estado: EstadoTareaSchema.optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = PapeleraSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 })
  }

  const repo = new TareasRepository(supabase)
  if (result.data.accion === 'mover') {
    await repo.moverAPapelera(id)
  } else {
    await repo.restaurar(id, result.data.estado)
  }
  return NextResponse.json({ ok: true })
}
