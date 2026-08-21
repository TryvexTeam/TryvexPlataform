import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EstadoLeadSchema } from '@/lib/types/lead'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'

const EstadoSchema = z.object({
  // Del esquema y no repetida aquí: enumerar los estados a mano fue lo que
  // dejó la ruta de tareas rechazando las columnas nuevas con un 400.
  estado: EstadoLeadSchema,
  // Sin exigir razón acá a propósito: el drag&drop a "perdido" (leads-pipeline.tsx)
  // suelta la tarjeta primero y manda a completar el motivo en la ficha después
  // (el toast no tiene espacio para el selector completo). El PATCH general de
  // /api/leads/[id] (LeadUpdateSchema) sí la exige — ese es el paso que cierra
  // el motivo de verdad, vía lead-panel.tsx o lead-form.tsx.
  razon_perdida: z.enum(['precio', 'sin_respuesta', 'competencia', 'sin_interes', 'otro']).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const result = EstadoSchema.safeParse(await req.json())
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  const repo = new LeadsRepository(supabase)
  await repo.cambiarEstado(id, result.data.estado, result.data.razon_perdida)
  return NextResponse.json({ ok: true })
}
