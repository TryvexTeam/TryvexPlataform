import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { LeadUpdateSchema } from '@/lib/types/lead'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ActividadRepository } from '@/lib/repos/actividad'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = LeadUpdateSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  const repo = new LeadsRepository(supabase)
  await repo.update(id, result.data)
  return NextResponse.json({ ok: true })
}

/**
 * "Eliminar" un lead ahora lo manda a la PAPELERA, no lo destruye.
 *
 * Hasta la migración 104 esto hacía un DELETE real, a un clic, desde dos
 * pantallas (`lead-detalle` y `lead-panel`) y sin dejar rastro: entre el 31-ago
 * y el 10-sep-2026 desaparecieron así 57 leads y no hubo forma de saber quién
 * fue. Y no se iba solo la ficha — `interacciones_lead`, `outreach_messages`,
 * `mensajes_wa`, `lead_asignaciones` y `vex_conversaciones` cuelgan de
 * fact_leads con ON DELETE CASCADE: se iba la conversación entera.
 *
 * El borrado de verdad sigue existiendo, en `DELETE /api/leads/[id]/papelera`,
 * y solo alcanza a lo que ya está en la papelera.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new LeadsRepository(supabase)

  const lead = await repo.getById(id)
  if (!lead) return NextResponse.json({ error: 'El lead no existe' }, { status: 404 })

  await repo.moverAPapelera(id)

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  await new ActividadRepository(supabase).registrar({
    integrante_id: perfil?.id ?? null,
    tipo_evento: 'lead_a_papelera',
    referencia_id: id,
    referencia_tipo: 'lead',
    descripcion: `Mandó "${lead.nombre_negocio}" a la papelera`,
  })

  return NextResponse.json({ ok: true, papelera: true })
}
