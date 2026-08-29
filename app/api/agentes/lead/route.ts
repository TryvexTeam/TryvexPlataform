import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { excedeLimite } from '@/lib/agentes/rate-limit'
import { resolverDestinatario, sufijoTelefono } from '@/lib/agentes/destinatario'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface Agente {
  id: string
  nombre: string
  creado_por: string | null
  token_hash: string
  expira_at: string | null
}

async function autenticar(req: Request): Promise<Agente | null> {
  const token = tokenDeCabecera(req)
  if (!token) return null

  const admin = createAdminClient() as SB
  const { data } = await admin.from('agentes').select('*').eq('activo', true)

  const agente = ((data ?? []) as Agente[]).find((a) => tokenCoincide(token, a.token_hash))
  if (!agente || tokenExpirado(agente.expira_at)) return null

  await admin.from('agentes').update({ ultimo_uso_at: new Date().toISOString() }).eq('id', agente.id)
  return agente
}

export async function GET(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const espera = excedeLimite(agente.id)
  if (espera !== null) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes' },
      { status: 429, headers: { 'Retry-After': String(espera) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const telefonoRaw = searchParams.get('telefono')
  if (!telefonoRaw) {
    return NextResponse.json({ success: false, error: 'Parámetro telefono requerido' }, { status: 400 })
  }

  if (!sufijoTelefono(telefonoRaw)) {
    return NextResponse.json({ success: false, error: 'Teléfono inválido o demasiado corto' }, { status: 400 })
  }

  const admin = createAdminClient() as SB

  // 1. De quién es el número. La búsqueda vive en un módulo compartido a
  // propósito: acá había una copia de la misma consulta, y arrastraba los dos
  // bugs que se arreglaron allá (elegía la primera de dos fichas empatadas, y
  // no encontraba a los que tienen el teléfono guardado sin código de área).
  const quien = await resolverDestinatario(admin, telefonoRaw)

  // Dos fichas con el mismo número no se desempatan solas. Se avisa en vez de
  // elegir: un agente que recibe la ficha equivocada responde con el contexto
  // de otro negocio, y eso es peor que no responder.
  if (quien.estado === 'ambiguo') {
    return NextResponse.json(
      {
        success: false,
        error: 'Ese teléfono está en más de una ficha; hay que corregirlo antes de usarlo',
        data: {
          ambiguo: true,
          candidatos: quien.candidatos.map((c) => ({ tipo: c.tipo, id: c.id, nombre: c.nombre })),
        },
      },
      { status: 409 },
    )
  }

  if (quien.estado === 'encontrado' && quien.destinatario.tipo === 'cliente') {
    const { data: cliente } = await admin
      .from('dim_clientes')
      .select('id, nombre, estado')
      .eq('id', quien.destinatario.id)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      data: {
        existe: true,
        es_cliente: true,
        cliente: cliente
          ? { id: cliente.id, nombre: cliente.nombre, estado: cliente.estado }
          : null,
        lead: null,
      },
    })
  }

  // 2. Traer la ficha del lead ya identificado.
  const { data: lead } =
    quien.estado === 'encontrado'
      ? await admin
          .from('fact_leads')
          .select('id, nombre_negocio, nicho, localidad, estado, score, notas, ultimo_contacto')
          .eq('id', quien.destinatario.id)
          .maybeSingle()
      : { data: null }

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
