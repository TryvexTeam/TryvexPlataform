import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ActividadRepository } from '@/lib/repos/actividad'

const PapeleraSchema = z.object({
  accion: z.enum(['mover', 'restaurar']),
})

/** Mueve el lead a la papelera o lo restaura. Las dos son reversibles. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const result = PapeleraSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const repo = new LeadsRepository(supabase)
  // El nombre se lee ANTES de mover: la bitácora tiene que poder nombrar al
  // lead aunque después alguien lo borre definitivamente y la ficha no exista.
  const lead = await repo.getById(id)
  if (!lead) return NextResponse.json({ error: 'El lead no existe' }, { status: 404 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  const actividad = new ActividadRepository(supabase)

  if (result.data.accion === 'mover') {
    await repo.moverAPapelera(id)
    await actividad.registrar({
      integrante_id: perfil?.id ?? null,
      tipo_evento: 'lead_a_papelera',
      referencia_id: id,
      referencia_tipo: 'lead',
      descripcion: `Mandó "${lead.nombre_negocio}" a la papelera`,
    })
  } else {
    await repo.restaurar(id)
    await actividad.registrar({
      integrante_id: perfil?.id ?? null,
      tipo_evento: 'lead_restaurado',
      referencia_id: id,
      referencia_tipo: 'lead',
      descripcion: `Restauró "${lead.nombre_negocio}" desde la papelera`,
    })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Borrado definitivo. Solo desde la papelera (lo exige el repo).
 *
 * ⚠️ Se lleva en cascada las interacciones, el outreach, el hilo de WhatsApp y
 * las asignaciones del lead. Es la única operación del CRM sobre leads que no
 * tiene vuelta atrás, y por eso queda registrada antes de ejecutarse.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const repo = new LeadsRepository(supabase)
  const lead = await repo.getById(id)
  if (!lead) return NextResponse.json({ error: 'El lead no existe' }, { status: 404 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)

  // La bitácora se escribe ANTES del borrado: después, la fila ya no existe y
  // nadie podría reconstruir qué se perdió. `referencia_id` no tiene FK, así
  // que el registro sobrevive al lead.
  await new ActividadRepository(supabase).registrar({
    integrante_id: perfil?.id ?? null,
    tipo_evento: 'lead_borrado_definitivo',
    referencia_id: id,
    referencia_tipo: 'lead',
    descripcion: `Borró definitivamente "${lead.nombre_negocio}" (${lead.telefono ?? 'sin teléfono'}, ${lead.nicho ?? 'sin nicho'}), con todo su historial`,
  })

  try {
    await repo.borrarDefinitivo(id)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo borrar' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
