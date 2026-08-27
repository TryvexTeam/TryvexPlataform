import { NextResponse, type NextRequest } from 'next/server'
import { obtenerMensajes } from '@/lib/vex/agente'
import { rechazarSiNoEsIntegrante, responderDelAgente } from '@/lib/vex/guardia'

export const dynamic = 'force-dynamic'

interface Contexto {
  params: Promise<{ id: string }>
}

/** GET /api/vex/agente/mensajes/[id] — el hilo de una conversación. */
export async function GET(_req: NextRequest, { params }: Contexto) {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  const { id } = await params
  const conversacion = Number(id)
  if (!Number.isInteger(conversacion) || conversacion <= 0) {
    return NextResponse.json({ success: false, error: 'Conversación inválida' }, { status: 400 })
  }

  return responderDelAgente(() => obtenerMensajes(conversacion))
}
