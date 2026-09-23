import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'

/**
 * Un agente declara sus rutinas y cuenta cómo le fue en la última corrida.
 *
 *   PUT /api/agentes/rutinas
 *   { "nombre": "Resumen diario de leads",
 *     "tipo": "reloj",
 *     "disparador": "todos los días a las 09:00",
 *     "resultado": "ok",                       // opcional: la corrida que acaba de hacer
 *     "detalle": "12 leads nuevos revisados",  // opcional
 *     "proximaAt": "2026-09-23T12:00:00Z",     // opcional
 *     "activa": true }
 *
 * Es un upsert por (agente, nombre): la primera vez la crea, las siguientes la
 * actualizan. Así el agente no tiene que recordar ningún id.
 *
 * Por qué importa: una rutina que deja de correr es un fallo silencioso. Nadie
 * la está mirando —por eso es una rutina—, así que la única forma de enterarse
 * es que el agente reporte cada corrida y la pantalla avise cuando se atrasa.
 */

const RutinaSchema = z.object({
  nombre: z.string().trim().min(3).max(120),
  tipo: z.enum(['reloj', 'evento']),
  disparador: z.string().trim().min(3).max(200),
  resultado: z.enum(['ok', 'falla']).optional(),
  detalle: z.string().trim().max(1000).optional(),
  proximaAt: z.string().datetime({ offset: true }).optional(),
  activa: z.boolean().optional(),
})

export async function PUT(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error
  const cuerpo = leido.cuerpo

  const datos = RutinaSchema.safeParse(cuerpo)
  if (!datos.success) return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')
  const d = datos.data

  const fila: Record<string, unknown> = {
    agente_id: agente.id,
    nombre: d.nombre,
    tipo: d.tipo,
    disparador: d.disparador,
  }
  if (d.activa !== undefined) fila.activa = d.activa
  if (d.proximaAt !== undefined) fila.proxima_at = d.proximaAt
  // Solo se toca la última corrida cuando se informa una. Declarar la rutina sin
  // resultado no debe borrar el historial de la anterior.
  if (d.resultado !== undefined) {
    fila.ultima_at = new Date().toISOString()
    fila.ultimo_resultado = d.resultado
    fila.ultimo_detalle = d.detalle ?? null
  }

  const { data, error } = await admin
    .from('agente_rutinas')
    .upsert(fila, { onConflict: 'agente_id,nombre' })
    .select('activa')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo registrar' }, { status: 500 })
  }

  // Se devuelve `activa` porque el equipo puede apagar la rutina desde la
  // pantalla, y esta respuesta es la única forma que tiene el agente de
  // enterarse. Si viene en false, no debe correrla.
  return NextResponse.json({ success: true, activa: data?.activa ?? true })
}
