/**
 * Lo que la landing sabe invalidar. Es una allowlist a los dos lados: acá para
 * no mandar cualquier cosa, y allá para no aceptarla — ver `TAGS_VALIDOS` en
 * Tryvex-Landing: app/api/revalidate/route.ts.
 */
export type TagLanding = 'equipo' | 'disponibilidad'

/**
 * Avisa a Tryvex-Landing que invalide un caché suyo, para que el cambio se vea
 * en segundos en vez de esperar a que expire solo.
 *
 * Nunca debe tumbar la operación que la llama: si la landing está caída o el
 * secreto no está puesto, el usuario igual ve su cambio guardado — solo tarda
 * en reflejarse afuera, con el ISR de respaldo.
 *
 * Los dos tags que existen hoy:
 *   · `equipo`         — alguien editó su ficha pública (/team)
 *   · `disponibilidad` — alguien cambió qué horas ofrece (el formulario de citas)
 *
 * El segundo importa más de lo que parece. Sin él, quien marca sus horas en el
 * CRM ve el formulario diciendo «no queda ninguna hora libre» hasta diez
 * minutos después —cinco del caché del CRM y cinco del de la landing—, y
 * concluye, razonablemente, que no funcionó.
 */
export async function revalidarEnLanding(tag: TagLanding): Promise<void> {
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
      body: JSON.stringify({ tag }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.error(`[revalidate-landing] tag="${tag}" respondió ${res.status}`)
    }
  } catch (err) {
    console.error(`[revalidate-landing] tag="${tag}" fetch falló`, err)
  }
}

/**
 * Atajo histórico: lo llaman las cuatro rutas de perfil y permisos. Se conserva
 * para no tocarlas por un cambio de firma.
 */
export function revalidarEquipoEnLanding(): Promise<void> {
  return revalidarEnLanding('equipo')
}
