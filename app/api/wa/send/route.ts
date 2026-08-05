import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizarTelefono } from '@/lib/vex/telefono'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

const procEnv = process['env']

// Contrato acordado con la vista de Leads (Jarvis): el panel llama a este
// endpoint con { lead_id, telefono, texto, enviado_por } al apretar
// "Enviar desde el CRM" (Botón 2). El telefono del body es solo referencia;
// si hay lead_id, se resuelve el telefono real desde fact_leads en el
// servidor para no confiar en un valor que pudo ser manipulado en el cliente.
const bodySchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  cliente_id: z.string().uuid().nullable().optional(),
  telefono: z.string().optional(),
  texto: z.string().min(1),
  enviado_por: z.string().min(1),
  es_bot: z.boolean().optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Tener sesión no alcanza. Más abajo esta ruta usa la clave de servicio, que
  // salta la RLS: sin este chequeo, cualquiera con una cuenta podía mandar un
  // WhatsApp a un cliente desde el número de la agencia. El daño no es leer
  // datos, es hablar en nombre de Tryvex.
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ error: 'No eres integrante activo' }, { status: 403 })

  const raw = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 })
  }
  const { lead_id, cliente_id, texto, enviado_por, es_bot } = parsed.data

  if (!lead_id && !cliente_id) {
    return NextResponse.json({ error: 'Falta lead_id o cliente_id.' }, { status: 400 })
  }

  const admin = createAdminClient() as SB
  let telefono = parsed.data.telefono ?? null

  if (lead_id) {
    const { data: lead } = await admin
      .from('fact_leads')
      .select('telefono')
      .eq('id', lead_id)
      .single()
    if (!lead) return NextResponse.json({ error: 'Lead no encontrado.' }, { status: 404 })
    telefono = lead.telefono
  }

  const numero = normalizarTelefono(telefono)
  if (!numero) {
    return NextResponse.json({ error: 'Teléfono inválido o inexistente para ese destinatario.' }, { status: 400 })
  }

  const bridgeUrl = procEnv.WA_BRIDGE_URL
  const bridgeToken = procEnv.WA_BRIDGE_TOKEN
  if (!bridgeUrl) {
    return NextResponse.json(
      { error: 'El puente de WhatsApp (wa-bridge) no está configurado (falta WA_BRIDGE_URL).' },
      { status: 503 }
    )
  }

  let bridgeRes: Response
  try {
    bridgeRes = await fetch(`${bridgeUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(bridgeToken ? { 'x-bridge-token': bridgeToken } : {}),
      },
      body: JSON.stringify({ telefono: numero, texto, lead_id: lead_id ?? null, cliente_id: cliente_id ?? null, es_bot: Boolean(es_bot), enviado_por }),
      signal: AbortSignal.timeout(20000),
    })
  } catch (err) {
    console.error('[api/wa/send] no se pudo contactar al wa-bridge:', err)
    return NextResponse.json({ error: 'El puente de WhatsApp no respondió.' }, { status: 502 })
  }

  const bridgeBody = await bridgeRes.json().catch(() => ({}))

  if (!bridgeRes.ok) {
    return NextResponse.json({ error: bridgeBody?.error ?? 'Falló el envío por el puente de WhatsApp.' }, { status: bridgeRes.status })
  }

  return NextResponse.json({ ok: true, mensajeWaId: bridgeBody.mensajeWaId, posicionCola: bridgeBody.posicionCola })
}
