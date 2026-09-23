import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'

/**
 * Un agente reporta lo que gastó.
 *
 *   POST /api/agentes/consumo
 *   { "modelo": "claude-sonnet-5", "tokensEntrada": 1200, "tokensSalida": 340,
 *     "costoUsd": 0.0081, "encargoId": "<uuid opcional>" }
 *
 * Existe porque hoy Jarvis, Ariel y los demás consumen modelos sin que nadie lo
 * anote, y la pantalla de Costos no puede mostrar lo que no se registra. El de
 * WhatsApp no usa esto: su gasto ya lo registra el VPS en `usage`, y sumarlo dos
 * veces duplicaría la cuenta.
 *
 * El costo lo informa el agente en dólares, porque así cobran los proveedores.
 * La pantalla lo convierte a pesos con el dólar observado del día.
 */

const ConsumoSchema = z.object({
  modelo: z.string().trim().min(1, 'Falta el nombre del modelo.').max(120),
  tokensEntrada: z.number().int().min(0).max(50_000_000),
  tokensSalida: z.number().int().min(0).max(50_000_000),
  // Un solo reporte de más de 500 dólares es casi seguro un error de unidades
  // (centavos por dólares, o tokens por costo). Mejor rechazarlo que ensuciar
  // la cuenta del mes.
  costoUsd: z
    .number()
    .min(0, 'El costo no puede ser negativo.')
    .max(500, 'Más de 500 dólares en un solo reporte: revise las unidades (¿centavos? ¿tokens?).'),
  encargoId: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error
  const cuerpo = leido.cuerpo

  const datos = ConsumoSchema.safeParse(cuerpo)
  if (!datos.success) return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')

  // Si dice a qué encargo corresponde, el encargo tiene que ser suyo: si no, un
  // agente podría cargarle su gasto al trabajo de otro.
  if (datos.data.encargoId) {
    const { data: encargo } = await admin
      .from('agente_encargos')
      .select('id')
      .eq('id', datos.data.encargoId)
      .eq('agente_id', agente.id)
      .maybeSingle()
    if (!encargo) return datosInvalidos('Ese encargo no existe o no es suyo.')
  }

  const { error } = await admin.from('agente_consumo').insert({
    agente_id: agente.id,
    encargo_id: datos.data.encargoId ?? null,
    modelo: datos.data.modelo,
    tokens_entrada: datos.data.tokensEntrada,
    tokens_salida: datos.data.tokensSalida,
    costo_usd: datos.data.costoUsd,
  })

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo registrar' }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { status: 201 })
}
