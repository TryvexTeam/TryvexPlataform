import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera } from '@/lib/agentes/token'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface Agente {
  id: string
  nombre: string
  creado_por: string | null
  token_hash: string
}

async function autenticar(req: Request): Promise<Agente | null> {
  const token = tokenDeCabecera(req)
  if (!token) return null

  const admin = createAdminClient() as SB
  const { data } = await admin.from('agentes').select('*').eq('activo', true)

  const agente = ((data ?? []) as Agente[]).find((a) => tokenCoincide(token, a.token_hash))
  if (!agente) return null

  await admin.from('agentes').update({ ultimo_uso_at: new Date().toISOString() }).eq('id', agente.id)
  return agente
}

export async function GET(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const telefonoRaw = searchParams.get('telefono')
  if (!telefonoRaw) {
    return NextResponse.json({ success: false, error: 'Parámetro telefono requerido' }, { status: 400 })
  }

  const sufijo = telefonoRaw.replace(/\D/g, '').slice(-8)
  if (sufijo.length < 8) {
    return NextResponse.json({ success: false, error: 'Teléfono inválido o demasiado corto' }, { status: 400 })
  }

  const admin = createAdminClient() as SB

  // 1. Verificar si es cliente existente activo
  const { data: cliente } = await admin
    .from('dim_clientes')
    .select('id, nombre, estado')
    .ilike('telefono', `%${sufijo}`)
    .maybeSingle()

  if (cliente) {
    return NextResponse.json({
      success: true,
      data: {
        existe: true,
        es_cliente: true,
        cliente: {
          id: cliente.id,
          nombre: cliente.nombre,
          estado: cliente.estado,
        },
        lead: null,
      },
    })
  }

  // 2. Buscar en fact_leads
  const { data: lead } = await admin
    .from('fact_leads')
    .select('id, nombre_negocio, nicho, localidad, estado, score, notas, ultimo_contacto')
    .ilike('telefono', `%${sufijo}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({
      success: true,
      data: {
        existe: false,
        es_cliente: false,
        lead: null,
      },
    })
  }

  // 3. Buscar último outreach
  const { data: outreach } = await admin
    .from('outreach_messages')
    .select('texto, estado, enviado_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 4. Últimas interacciones
  const { data: interacciones } = await admin
    .from('interacciones_lead')
    .select('tipo, notas, created_at')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(3)

  return NextResponse.json({
    success: true,
    data: {
      existe: true,
      es_cliente: false,
      lead: {
        id: lead.id,
        nombre_negocio: lead.nombre_negocio,
        nicho: lead.nicho,
        localidad: lead.localidad,
        estado: lead.estado,
        score: lead.score,
        notas: lead.notas,
        outreach: outreach
          ? {
              texto: outreach.texto,
              estado: outreach.estado,
              enviado_at: outreach.enviado_at,
            }
          : null,
        interacciones: interacciones ?? [],
      },
    },
  })
}
