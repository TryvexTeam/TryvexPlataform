import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const procEnv = process['env']

// Expone el estado del wa-bridge (sesión de WhatsApp arriba/abajo, cola
// pendiente) para que el CRM lo pueda mostrar — complementa el vigía por
// webhook, que avisa al equipo activamente si algo se cae.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const bridgeUrl = procEnv.WA_BRIDGE_URL
  if (!bridgeUrl) {
    return NextResponse.json({ configurado: false, sesionLista: false })
  }

  try {
    const res = await fetch(`${bridgeUrl}/health`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error('status ' + res.status)
    const data = await res.json()
    return NextResponse.json({ configurado: true, ...data })
  } catch (err) {
    console.error('[api/wa/health] wa-bridge no respondió:', err)
    return NextResponse.json({ configurado: true, sesionLista: false, error: 'wa-bridge no responde' }, { status: 502 })
  }
}
