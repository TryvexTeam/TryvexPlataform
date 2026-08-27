import { NextResponse, type NextRequest } from 'next/server'
import { cambiarModo, type ModoConversacion } from '@/lib/vex/agente'
import { rechazarSiNoEsIntegrante, responderDelAgente } from '@/lib/vex/guardia'

export const dynamic = 'force-dynamic'

const MODOS: ReadonlySet<string> = new Set<ModoConversacion>(['AI', 'HUMAN'])

/**
 * POST /api/vex/agente/modo — pasa una conversación a manos humanas, o se la
 * devuelve al agente.
 *
 * Es el interruptor que pidió el equipo para la ficha del lead: cuando alguien
 * toma el control, Vex se calla en ese hilo y solo en ese.
 */
export async function POST(req: NextRequest) {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  let cuerpo: { conversacion?: number; modo?: string }
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 })
  }

  const { conversacion, modo } = cuerpo
  if (!Number.isInteger(conversacion) || (conversacion ?? 0) <= 0) {
    return NextResponse.json({ success: false, error: 'Conversación inválida' }, { status: 400 })
  }
  if (!modo || !MODOS.has(modo)) {
    return NextResponse.json({ success: false, error: 'El modo debe ser AI o HUMAN' }, { status: 400 })
  }

  return responderDelAgente(() => cambiarModo(conversacion as number, modo as ModoConversacion))
}
