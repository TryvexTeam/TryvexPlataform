import { obtenerConversaciones } from '@/lib/vex/agente'
import { rechazarSiNoEsIntegrante, responderDelAgente } from '@/lib/vex/guardia'

export const dynamic = 'force-dynamic'

/** GET /api/vex/agente/conversaciones — los hilos que el agente atiende. */
export async function GET() {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  return responderDelAgente(() => obtenerConversaciones())
}
