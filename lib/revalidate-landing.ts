/**
 * Avisa a Tryvex-Landing que invalide el caché de /team cuando un integrante
 * guarda su perfil, para que el cambio se vea en segundos en vez de esperar
 * el ISR de 1h. Ver el endpoint en Tryvex-Landing: app/api/revalidate/route.ts
 *
 * Nunca debe tumbar el guardado del perfil: si la landing está caída o el
 * secreto no está seteado, el usuario igual ve su perfil guardado — solo
 * tarda hasta 1h en reflejarse en la landing (el ISR de respaldo).
 */
export async function revalidarEquipoEnLanding(): Promise<void> {
  const url = process.env.LANDING_REVALIDATE_URL
  const secret = process.env.LANDING_REVALIDATE_SECRET
  if (!url || !secret) return

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': secret,
        'x-revalidate-timestamp': String(Date.now()),
      },
      body: JSON.stringify({ tag: 'equipo' }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error(`[revalidate-landing] respondió ${res.status}`)
    }
  } catch (err) {
    console.error('[revalidate-landing] fetch falló', err)
  }
}
