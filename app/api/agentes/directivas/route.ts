import { NextResponse } from 'next/server'
import { autenticarAgente } from '@/lib/agentes/autenticar'
import { directivasVigentes } from '@/lib/repos/directivas'

/**
 * Lo que el equipo decidió y el agente tiene que tener en cuenta hoy.
 *
 *   GET /api/agentes/directivas?para=conversacion      (por defecto)
 *   GET /api/agentes/directivas?para=primer_mensaje
 *
 *   → { "success": true, "directivas": ["Este mes hay 20 % de descuento en landings."] }
 *
 * Las escribe el equipo en Intelligence. El agente de WhatsApp las pide y las
 * suma a su guion: así una promoción o un cambio de oferta llega a todos los
 * agentes sin tocar código. Solo devuelve las activas y vigentes hoy (día
 * chileno), así que una promoción vencida deja de ofrecerse sola.
 */
export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error

  const para = new URL(req.url).searchParams.get('para') === 'primer_mensaje' ? 'primer_mensaje' : 'conversacion'
  const directivas = await directivasVigentes(auth.admin, para)

  return NextResponse.json({ success: true, para, directivas })
}
