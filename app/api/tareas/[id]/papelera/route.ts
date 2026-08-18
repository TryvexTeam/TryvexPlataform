import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { TareasRepository } from '@/lib/repos/tareas'

const PapeleraSchema = z.object({
  accion: z.enum(['mover', 'restaurar']),
  estado: z.enum(['sin_empezar', 'en_curso', 'listo']).optional(),
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
