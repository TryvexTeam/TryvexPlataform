import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Los servidores que WebRTC usa para atravesar el router de cada uno.
 *
 * STUN es gratis y resuelve la mayoría de los casos: le dice a cada navegador
 * cuál es su IP pública y los dos se conectan directo. El video no pasa por
 * ningún servidor — de ahí que las llamadas sean ilimitadas y no cuesten nada.
 *
 * TURN es el plan B para el 10-20% de redes que no dejan conexión directa
 * (NAT simétrico, wifi corporativo). Ahí sí el audio y el video se retransmiten
 * por un servidor, y eso sí consume datos. Se usa el de Cloudflare: 1.000 GB al
 * mes gratis, que a los pocos minutos de relay que realmente se necesitan da
 * para ~1.400 horas mensuales. Si algún día se pasara, este endpoint es el único
 * lugar a cambiar: el resto de la app solo consume la lista que devuelve.
 */

export const dynamic = 'force-dynamic'

/** Que no vivan más que la llamada más larga que uno espere tener. */
const TTL_SEGUNDOS = 4 * 60 * 60

/** Gratis y sin cuenta. Alcanzan solos en la mayoría de las redes domésticas. */
const STUN_PUBLICOS = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN

  // Sin credenciales la app igual funciona: STUN solo conecta a la mayoría. Pero
  // se devuelve `turn: false` para poder decirlo en pantalla. Un fallback que se
  // hace pasar por completo es mentira estructural: la llamada fallaría en una
  // red de cada cinco y nadie sabría por qué.
  if (!keyId || !token) {
    return NextResponse.json({
      success: true,
      data: { iceServers: STUN_PUBLICOS, turn: false },
    })
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TTL_SEGUNDOS }),
        cache: 'no-store',
      },
    )

    if (!res.ok) {
      console.error('[ice] Cloudflare respondió', res.status, await res.text().catch(() => ''))
      return NextResponse.json({
        success: true,
        data: { iceServers: STUN_PUBLICOS, turn: false },
      })
    }

    const json = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] }

    // La API devuelve `iceServers` como objeto único en algunas respuestas y como
    // arreglo en otras. RTCPeerConnection solo acepta arreglo.
    const servidores = Array.isArray(json.iceServers)
      ? json.iceServers
      : json.iceServers
        ? [json.iceServers]
        : []

    if (servidores.length === 0) {
      return NextResponse.json({ success: true, data: { iceServers: STUN_PUBLICOS, turn: false } })
    }

    return NextResponse.json({ success: true, data: { iceServers: servidores, turn: true } })
  } catch (err) {
    console.error('[ice]', err instanceof Error ? err.message : err)
    return NextResponse.json({ success: true, data: { iceServers: STUN_PUBLICOS, turn: false } })
  }
}
