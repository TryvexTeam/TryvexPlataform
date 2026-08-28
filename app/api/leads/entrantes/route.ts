import { createAdminClient } from '@/lib/supabase/server'
import { entrantesSinIdentificar } from '@/lib/vex/sin-identificar'
import { agenteConfigurado } from '@/lib/vex/agente'
import { rechazarSiNoEsIntegrante, responderDelAgente } from '@/lib/vex/guardia'
import { NextResponse } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export const dynamic = 'force-dynamic'

/**
 * GET /api/leads/entrantes
 *
 * Quién le escribió al WhatsApp del equipo sin estar en la base.
 *
 * El agente no le contesta a un número desconocido, y eso está bien: es lo que
 * evita responderle a cualquiera. Pero sin esta lista esos mensajes no se ven
 * en ningún lado, y alguien que escribe sin que nadie lo atienda es un cliente
 * potencial perdido en silencio.
 */
export async function GET() {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  // Sin agente no hay nada que listar, y eso no es un error: significa que
  // todavía no está conectado.
  if (!agenteConfigurado()) {
    return NextResponse.json({ success: true, data: [] })
  }

  const admin = createAdminClient() as SB
  return responderDelAgente(() => entrantesSinIdentificar(admin))
}
