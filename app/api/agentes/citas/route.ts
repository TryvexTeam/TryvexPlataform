import { NextResponse } from 'next/server'
import { z } from 'zod'
import { autenticarAgente, datosInvalidos, leerJson } from '@/lib/agentes/autenticar'

/**
 * El conocimiento, visto desde el agente.
 *
 *   GET  /api/agentes/citas               → los documentos del Cerebro, para leerlos
 *   POST /api/agentes/citas               → "usé este documento para responder"
 *        { "documentoId": "<uuid>", "encargoId": "<uuid opcional>" }
 *
 * Los documentos viven en `cerebro_docs` (la sección Cerebro del CRM). Lo que no
 * existía era saber cuáles usa de verdad cada agente. Sin eso, la pantalla de
 * Conocimiento no puede avisar de lo que importa: un documento que nadie cita
 * en 30 días está mal indexado o no le sirve a nadie.
 */

export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { admin } = auth

  const { data, error } = await admin
    .from('cerebro_docs')
    .select('id, slug, titulo, categoria, contenido_md, updated_at')
    .order('orden', { ascending: true })
    .limit(200)

  if (error) {
    return NextResponse.json({ success: false, error: 'No se pudo leer el Cerebro' }, { status: 500 })
  }
  return NextResponse.json({ success: true, documentos: data ?? [] })
}

const CitaSchema = z.object({
  documentoId: z.string().uuid(),
  encargoId: z.string().uuid().optional(),
})

export async function POST(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error
  const { agente, admin } = auth

  const leido = await leerJson(req)
  if ('error' in leido) return leido.error
  const cuerpo = leido.cuerpo

  const datos = CitaSchema.safeParse(cuerpo)
  if (!datos.success) return datosInvalidos(datos.error.issues[0]?.message ?? 'Datos inválidos.')

  if (datos.data.encargoId) {
    const { data: encargo } = await admin
      .from('agente_encargos')
      .select('id')
      .eq('id', datos.data.encargoId)
      .eq('agente_id', agente.id)
      .maybeSingle()
    if (!encargo) return datosInvalidos('Ese encargo no existe o no es suyo.')
  }

  const { error } = await admin.from('agente_citas').insert({
    agente_id: agente.id,
    documento_id: datos.data.documentoId,
    encargo_id: datos.data.encargoId ?? null,
  })

  if (error) {
    // Una FK rota es el caso típico: el documento se borró o el id está mal.
    const inexistente = error.code === '23503'
    return NextResponse.json(
      {
        success: false,
        error: inexistente ? 'Ese documento no existe en el Cerebro.' : 'No se pudo registrar',
      },
      { status: inexistente ? 400 : 500 },
    )
  }
  return NextResponse.json({ success: true }, { status: 201 })
}
