import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizarTelefono } from '@/lib/vex/telefono'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

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
  const { lead_id, texto, enviado_por } = parsed.data

  // outreach_messages.lead_id es NOT NULL: el buzon sirve para leads. Mandarle
  // a un cliente sigue siendo posible por el camino viejo hasta que se decida
  // moverlo (fuera del alcance del pedido del 10-ago).
  if (!lead_id) {
    return NextResponse.json(
      { error: 'Falta lead_id. El envio a clientes todavia no pasa por el buzon.' },
      { status: 400 }
    )
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

  // El CRM ya no llama al puente: lo anota aca y el puente lo pasa a buscar.
  // El puente escucha en 127.0.0.1 del VPS — desde Vercel es inalcanzable, y
  // exponerlo pedia un tunel cuya direccion cambia en cada reinicio. Mismo
  // patron que scraper_runs: si el puente esta caido, esto queda encolado en
  // vez de perderse. Ver migracion 041 y el diseno del 10-ago-2026.
  const { data: encolado, error: errorEncolar } = await admin
    .from('outreach_messages')
    .insert({
      lead_id,
      canal: 'whatsapp',
      texto,
      estado: 'encolado',
      enviado_por: enviado_por.trim(),
      aprobado_por: perfil.id,
    })
    .select('id')
    .single()

  if (errorEncolar) {
    console.error('[api/wa/send] no se pudo encolar:', errorEncolar)
    return NextResponse.json({ error: 'No se pudo encolar el mensaje.' }, { status: 500 })
  }

  // 202 y no 200: el mensaje esta aceptado, todavia no entregado.
  return NextResponse.json({ ok: true, encolado: true, id: encolado.id }, { status: 202 })
}
