'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { tablaEncargos } from '@/lib/repos/tabla-encargos'

/**
 * Lo que el equipo puede hacerle a la cola de encargos.
 *
 * La regla de la casa, y el motivo de que esto viva en el servidor: un agente
 * NO trabaja lo que se le encola hasta que una persona lo aprueba. Si la
 * aprobación se decidiera en el navegador, bastaría con llamar a la API a mano
 * para saltársela. Acá se resuelve quién es el integrante desde su sesión, no
 * desde lo que mande el cliente.
 *
 * La base además lo exige por su cuenta (`aprobado_necesita_firma`), así que
 * aunque este archivo tuviera un error, no se puede dejar un encargo aprobado
 * sin constancia de quién lo aprobó.
 */

/** Quién está pidiendo la acción. Sale de la sesión, nunca del formulario. */
async function integranteActual() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Hay que iniciar sesión para operar la cola de encargos.')

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) throw new Error('Solo los integrantes del equipo pueden operar a los agentes.')

  return { supabase, perfil }
}

const EncolarSchema = z.object({
  agenteId: z.string().uuid('Hay que elegir un agente.'),
  tipo: z.enum(['tarea', 'duda']),
  titulo: z.string().trim().min(3, 'El título tiene que decir algo.').max(200),
  detalle: z.string().trim().max(4000).optional(),
  prioridad: z.enum(['baja', 'media', 'alta']).default('media'),
})

export type Resultado = { ok: true } | { ok: false; error: string }

/**
 * Encolarle una tarea o una duda a un agente.
 *
 * Nace en `encolado`: visible para el agente, pero sin permiso para ejecutarlo.
 */
export async function encolarEncargo(entrada: z.input<typeof EncolarSchema>): Promise<Resultado> {
  const datos = EncolarSchema.safeParse(entrada)
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  try {
    const { supabase, perfil } = await integranteActual()

    const { error } = await tablaEncargos(supabase).insert({
      agente_id: datos.data.agenteId,
      tipo: datos.data.tipo,
      titulo: datos.data.titulo,
      detalle: datos.data.detalle || null,
      prioridad: datos.data.prioridad,
      creado_por: perfil.id,
      estado: 'encolado',
    })

    if (error) return { ok: false, error: error.message }

    revalidatePath('/vex/intelligence')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo encolar.' }
  }
}

/**
 * Darle permiso al agente para trabajar un encargo.
 *
 * Este es el momento que el señor Ignacio pidió proteger: hasta acá el encargo
 * existía pero nadie podía ejecutarlo. Queda constancia de quién autorizó y
 * cuándo, porque un permiso sin firma no se puede revisar después.
 */
export async function aprobarEncargo(encargoId: string): Promise<Resultado> {
  try {
    const { supabase, perfil } = await integranteActual()

    const { error } = await tablaEncargos(supabase)
      .update({
        estado: 'aprobado',
        aprobado_por: perfil.id,
        aprobado_at: new Date().toISOString(),
      })
      .eq('id', encargoId)
      // Solo se aprueba lo que está esperando. Si ya se aprobó o ya se
      // respondió, esto no vuelve a tocarlo.
      .eq('estado', 'encolado')

    if (error) return { ok: false, error: error.message }

    revalidatePath('/vex/intelligence')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aprobar.' }
  }
}

/**
 * Rechazar un encargo, con el motivo escrito.
 *
 * El motivo es obligatorio a propósito: un rechazo mudo deja a quien lo pidió
 * sin saber qué corregir, y a los demás sin saber por qué no se hizo.
 */
export async function rechazarEncargo(encargoId: string, motivo: string): Promise<Resultado> {
  const limpio = motivo.trim()
  if (limpio.length < 3) return { ok: false, error: 'Hay que decir por qué se rechaza.' }

  try {
    const { supabase } = await integranteActual()

    const { error } = await tablaEncargos(supabase)
      .update({ estado: 'rechazado', motivo_rechazo: limpio })
      .eq('id', encargoId)
      .in('estado', ['encolado', 'aprobado'])

    if (error) return { ok: false, error: error.message }

    revalidatePath('/vex/intelligence')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo rechazar.' }
  }
}

/**
 * Sacar de la cola lo que ya se resolvió.
 *
 * Archiva, no borra. La fila queda con quién lo pidió, quién lo aprobó y qué
 * contestó el agente: eso es lo que permite revisar un encargo semanas después.
 * En pantalla desaparece igual, que era lo que se buscaba.
 */
export async function archivarEncargo(encargoId: string): Promise<Resultado> {
  try {
    const { supabase } = await integranteActual()

    const { error } = await tablaEncargos(supabase)
      .update({ archivado_at: new Date().toISOString() })
      .eq('id', encargoId)
      .in('estado', ['respondido', 'rechazado'])

    if (error) return { ok: false, error: error.message }

    revalidatePath('/vex/intelligence')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo archivar.' }
  }
}
