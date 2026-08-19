import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { InteraccionInsertSchema } from '@/lib/types/lead'
import { z } from 'zod'

/**
 * `integrante_id` NO llega del cliente: lo resuelve el servidor a partir de la
 * sesión.
 *
 * Antes venía en el cuerpo y se guardaba tal cual, así que cualquiera podía
 * registrar una llamada o una nota a nombre de otra persona del equipo. El
 * historial de un lead es el registro de quién hizo qué — si se puede firmar
 * por otro, deja de servir como registro.
 */
const Schema = InteraccionInsertSchema

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = Schema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json({ error: 'No eres integrante activo' }, { status: 403 })
  }

  const repo = new LeadsRepository(supabase)
  await repo.createInteraccion({ ...result.data, integrante_id: perfil.id })

  // Devolver la interacción recién creada
  const interacciones = await repo.listInteracciones(result.data.lead_id)
  return NextResponse.json(interacciones[0], { status: 201 })
}
