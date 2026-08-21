import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenCoincide, tokenDeCabecera, tokenExpirado } from '@/lib/agentes/token'
import { excedeLimite } from '@/lib/agentes/rate-limit'

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

export async function POST(req: Request) {
  const agente = await autenticar(req)
  if (!agente) return NextResponse.json({ success: false, error: 'Token inválido' }, { status: 401 })

  const espera = excedeLimite(agente.id)
  if (espera !== null) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes' },
      { status: 429, headers: { 'Retry-After': String(espera) } },
    )
  }

  const cuerpo = await req.json().catch(() => null)
  if (!cuerpo || !cuerpo.lead_id || !cuerpo.texto) {
    return NextResponse.json({ success: false, error: 'Faltan campos requeridos (lead_id, texto)' }, { status: 400 })
  }

  const admin = createAdminClient() as SB

  const { data, error } = await admin
    .from('mensajes_wa')
    .insert({
      lead_id: cuerpo.lead_id,
      cliente_id: cuerpo.cliente_id ?? null,
      direccion: cuerpo.direccion || 'out',
      texto: cuerpo.texto,
      wa_message_id: cuerpo.wa_message_id ?? null,
      chip_id: cuerpo.chip_id ?? null,
      es_bot: true,
      enviado_por: agente.nombre || 'Emili',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
