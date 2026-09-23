import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'

/**
 * Un agente propone una mejora a partir de lo que ve fallar.
 *
 *   POST /api/agentes/mejoras
 *   { "titulo": "Agregar la política de devoluciones al guion",
 *     "detalle": "Qué cambiar y dónde",
 *     "evidencia": "6 de 9 dudas de la semana preguntan por devoluciones" }
 *
 * La mejora nace `propuesta` y el agente NO puede aprobarla ni aplicarla: igual
 * que la cola de encargos, una persona decide antes. La base lo exige por su
 * cuenta (`mejora_aprobada_necesita_firma`).
 *
 * La evidencia es obligatoria a propósito: una mejora sin el dato que la
 * justifica es una opinión, y un agente con opiniones no revisadas termina
 * reescribiendo su propio guion.
 */

const MejoraSchema = z.object({
  titulo: z.string().trim().min(5).max(200),
  detalle: z.string().trim().max(4000).optional(),
  evidencia: z
    .string()
    .trim()
    .min(10, 'Diga en qué se basa: una mejora sin evidencia es una opinión.')
    .max(2000),
})

export async function POST(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error
  const cuerpo = leido.cuerpo

  const datos = MejoraSchema.safeParse(cuerpo)
  if (!datos.success) return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')

  const { data, error } = await admin
    .from('mejoras')
    .insert({
      agente_id: agente.id,
      titulo: datos.data.titulo,
      detalle: datos.data.detalle ?? null,
      evidencia: datos.data.evidencia,
      estado: 'propuesta',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo registrar' }, { status: 500 })
  }
  return NextResponse.json({ success: true, id: data.id, estado: 'propuesta' }, { status: 201 })
}
