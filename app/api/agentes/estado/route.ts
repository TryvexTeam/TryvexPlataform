import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'
import { ESTADOS_DECLARABLES } from '@/lib/agentes/estado-oficina'

/**
 * El agente dice en qué está, para la oficina de Intelligence.
 *
 *   PUT /api/agentes/estado
 *   { "estado": "trabajando",          // trabajando | descansando | ausente
 *     "nota": "revisando el proxy",    // opcional, máx. 120
 *     "minutos": 30 }                  // opcional: cuánto vale (1 a 480, por defecto 30)
 *
 *   GET /api/agentes/estado            → lo que tiene declarado ahora
 *
 * Y la actividad en vivo, que manda el hook de Claude Code (scripts/hook-oficina.mjs):
 *   { "turno": "inicio" }                     // empezó a trabajar en algo
 *   { "herramienta": "Bash · correr pruebas" } // la herramienta que usa ahora
 *   { "turno": "fin" }                        // terminó el turno
 * Se pueden combinar con "estado" en el mismo pedido. La actividad va a otra
 * tabla (agente_actividad) para no recargar Intelligence en cada herramienta.
 *
 * Lo declarado VENCE. Un agente que dice "trabajando" y se cae no puede quedar
 * trabajando en la pantalla para siempre: pasado el plazo, la oficina vuelve a
 * mirar su latido. Si sigue en lo mismo, que lo vuelva a declarar.
 *
 * Y no manda sobre los hechos: si tiene un encargo tomado, la oficina lo
 * muestra trabajando aunque haya declarado otra cosa (lib/agentes/estado-oficina.ts).
 */

const EstadoSchema = z
  .object({
    estado: z.enum(ESTADOS_DECLARABLES).optional(),
    nota: z.string().trim().max(120, 'La nota va en pocas palabras: máximo 120 caracteres.').optional(),
    minutos: z.number().int().min(1).max(480).optional(),
    herramienta: z.string().trim().min(1).max(160).optional(),
    turno: z.enum(['inicio', 'fin']).optional(),
  })
  .refine((d) => d.estado || d.herramienta || d.turno, {
    message: 'Mande al menos "estado", "herramienta" o "turno".',
  })

/** Por si un agente manda un token dentro de la etiqueta: nunca se guarda. */
function sinSecretos(texto: string): string {
  return texto.replace(/(txa_|sk-|ghp_|github_pat_|eyJ)[A-Za-z0-9._-]{8,}/g, '[oculto]')
}

const MINUTOS_POR_DEFECTO = 30

export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const { data, error } = await admin
    .from('agentes')
    .select('estado_declarado, estado_nota, estado_hasta')
    .eq('id', agente.id)
    .single()
  if (error) return NextResponse.json({ success: false, error: 'No se pudo leer' }, { status: 500 })

  const vigente = Boolean(data?.estado_hasta && Date.parse(data.estado_hasta) > Date.now())
  return NextResponse.json({
    success: true,
    estado: vigente ? data?.estado_declarado : null,
    nota: vigente ? data?.estado_nota : null,
    hasta: vigente ? data?.estado_hasta : null,
  })
}

export async function PUT(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error

  const datos = EstadoSchema.safeParse(leido.cuerpo)
  if (!datos.success) return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')
  const d = datos.data

  const ahora = new Date()
  const hasta = new Date(ahora.getTime() + (d.minutos ?? MINUTOS_POR_DEFECTO) * 60_000)

  if (d.estado) {
    const { error } = await admin
      .from('agentes')
      .update({
        estado_declarado: d.estado,
        estado_nota: d.nota || null,
        estado_hasta: hasta.toISOString(),
        estado_declarado_at: ahora.toISOString(),
      })
      .eq('id', agente.id)
    if (error) return NextResponse.json({ success: false, error: 'No se pudo guardar' }, { status: 500 })
  }

  if (d.herramienta || d.turno) {
    const { data: previa } = await admin
      .from('agente_actividad')
      .select('herramientas_turno, turno_desde')
      .eq('agente_id', agente.id)
      .maybeSingle()

    const fila: Record<string, unknown> = { agente_id: agente.id, updated_at: ahora.toISOString() }
    if (d.turno === 'inicio') {
      fila.turno_desde = ahora.toISOString()
      fila.herramienta = null
      fila.herramientas_turno = 0
    } else if (d.turno === 'fin') {
      fila.turno_desde = null
      fila.herramienta = null
    }
    if (d.herramienta) {
      fila.herramienta = sinSecretos(d.herramienta)
      fila.herramienta_at = ahora.toISOString()
      fila.herramientas_turno = (d.turno === 'inicio' ? 0 : (previa?.herramientas_turno ?? 0)) + 1
      // Una herramienta sin turno abierto (el hook se instaló a mitad de una
      // sesión) abre uno: si no, el panel no sabría desde cuándo trabaja.
      if (!previa?.turno_desde && d.turno !== 'inicio') fila.turno_desde = ahora.toISOString()
    }

    const { error } = await admin.from('agente_actividad').upsert(fila, { onConflict: 'agente_id' })
    if (error) return NextResponse.json({ success: false, error: 'No se pudo guardar la actividad' }, { status: 500 })
  }

  return NextResponse.json({ success: true, estado: d.estado ?? null, hasta: d.estado ? hasta.toISOString() : null })
}
