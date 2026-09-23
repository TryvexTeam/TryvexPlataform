'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { desactivarDemo, insertarDemo, leadParaGuionDemo } from '@/lib/repos/demos'
import { armarGuionDemo } from '@/lib/vex/guion-demo'
import { normalizarTelefonoDemo } from '@/lib/vex/telefono-demo'
import type { Resultado } from './acciones'

export type ResultadoGuionDemo = Extract<Resultado, { ok: false }> | {
  ok: true
  guion: string
  nombreNegocio: string
  telefono: string
}

const IdSchema = z.string().uuid('El identificador no es válido.')
const CrearDemoSchema = z.object({
  leadId: IdSchema.optional(),
  // Mismos límites que la base (2 a 120): si no calzan, un nombre largo pasa el
  // formulario y choca en la base con un error que nadie entiende.
  nombreNegocio: z.string().trim().min(2, 'Escriba el nombre del negocio.').max(120, 'El nombre admite hasta 120 caracteres.'),
  telefono: z.string().transform(normalizarTelefonoDemo)
    .pipe(z.string('Ingrese un teléfono de 8 a 15 dígitos, con código de país.')),
  guion: z.string().trim().min(50, 'El guion necesita al menos 50 caracteres.').max(8000, 'El guion admite hasta 8000 caracteres.'),
  horas: z.union([z.literal(24), z.literal(72), z.literal(168)], { error: 'Elija una duración de 24 horas, 3 días o 7 días.' }),
  limiteMensajes: z.number().int('El límite debe ser un número entero.').min(1, 'El límite mínimo es 1 mensaje.').max(500, 'El límite máximo es 500 mensajes.'),
})

export type CrearDemoEntrada = z.input<typeof CrearDemoSchema>

async function integranteActual() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Hay que iniciar sesión para administrar demos.')
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) throw new Error('Solo los integrantes del equipo pueden administrar demos.')
  return { supabase, perfil }
}

export async function sugerirGuionDemo(leadId: string): Promise<ResultadoGuionDemo> {
  const id = IdSchema.safeParse(leadId)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }
  try {
    const { supabase } = await integranteActual()
    const lead = await leadParaGuionDemo(supabase, id.data)
    const guion = armarGuionDemo(lead)
    // Solo lee: no hay nada que refrescar en la página.
    return { ok: true, guion, nombreNegocio: lead.nombre_negocio, telefono: normalizarTelefonoDemo(lead.telefono ?? '') ?? '' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo sugerir el guion.' }
  }
}

export async function crearDemo(entrada: CrearDemoEntrada): Promise<Resultado> {
  const datos = CrearDemoSchema.safeParse(entrada)
  if (!datos.success) return { ok: false, error: datos.error.issues[0]?.message ?? 'Revise los datos de la demo.' }
  try {
    const { supabase, perfil } = await integranteActual()
    // Si la ficha se borró mientras se editaba, no se vincula una demo nueva a la papelera.
    if (datos.data.leadId) await leadParaGuionDemo(supabase, datos.data.leadId)
    const { error } = await insertarDemo(supabase, {
      ...datos.data,
      leadId: datos.data.leadId ?? null,
      activa: true,
      venceAt: new Date(Date.now() + datos.data.horas * 3_600_000).toISOString(),
      creadoPor: perfil.id,
    })
    if (error) return { ok: false, error: error.code === '23505'
      ? 'Ese número ya tiene una demo activa: apáguela antes de crear otra.'
      : `No se pudo activar la demo: ${error.message}` }
    revalidatePath('/vex/intelligence')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo activar la demo.' }
  }
}

export async function apagarDemo(id: string): Promise<Resultado> {
  const datos = IdSchema.safeParse(id)
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }
  try {
    const { supabase } = await integranteActual()
    const { data, error } = await desactivarDemo(supabase, datos.data)
    if (error) return { ok: false, error: `No se pudo apagar la demo: ${error.message}` }
    if (!data) return { ok: false, error: 'La demo no está disponible.' }
    revalidatePath('/vex/intelligence')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo apagar la demo.' }
  }
}
