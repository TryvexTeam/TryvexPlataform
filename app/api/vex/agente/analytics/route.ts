import { type NextRequest } from 'next/server'
import { obtenerAnalytics } from '@/lib/vex/agente'
import { rechazarSiNoEsIntegrante, responderDelAgente } from '@/lib/vex/guardia'

export const dynamic = 'force-dynamic'

const DIAS_POR_DEFECTO = 7
const DIAS_MAX = 90

/** GET /api/vex/agente/analytics?dias=7 — actividad y coste del agente. */
export async function GET(req: NextRequest) {
  const rechazo = await rechazarSiNoEsIntegrante()
  if (rechazo) return rechazo

  // Acotado: un rango enorme hace que el agente escanee toda su base para
  // devolver una gráfica que nadie pidió.
  const pedido = Number(req.nextUrl.searchParams.get('dias'))
  const dias = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, DIAS_MAX) : DIAS_POR_DEFECTO

  return responderDelAgente(() => obtenerAnalytics(dias))
}
