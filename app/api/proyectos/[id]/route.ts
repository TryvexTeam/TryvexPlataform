import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ProyectosRepository } from '@/lib/repos/proyectos'
import { ProyectoUpdateSchema } from '@/lib/types/proyecto'
import { z } from 'zod'

/* Como en el POST: el equipo viaja con el proyecto pero vive en su propia
   tabla, así que se valida aparte. `undefined` significa "no lo toques"; una
   lista vacía sí significa "deja el proyecto sin nadie". */
const EquipoSchema = z.array(z.string().uuid()).optional()

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const cuerpo = await req.json()
  const result = ProyectoUpdateSchema.safeParse(cuerpo)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const equipo = EquipoSchema.safeParse(cuerpo?.integrantes_ids)
  if (!equipo.success) {
    return NextResponse.json({ error: 'Equipo inválido' }, { status: 400 })
  }

  const repo = new ProyectosRepository(supabase)
  await repo.update(id, result.data)
  if (equipo.data !== undefined) await repo.fijarEquipo(id, equipo.data)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  await new ProyectosRepository(supabase).delete(id)
  return NextResponse.json({ ok: true })
}
