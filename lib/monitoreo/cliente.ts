import { MetricasV1Schema, type MetricasV1 } from './esquema'

export const TIMEOUT_MS = 10_000
/** La respuesta legítima pesa unos KB; pasado 1 MB se corta la descarga. */
export const MAX_BYTES = 1_000_000
const CLAVE_RE = /^[A-Z0-9_]{2,40}$/

export interface ResultadoPull {
  /** 0 = sin respuesta HTTP (o no se llegó a pedir). */
  httpStatus: number
  /** JSON tal cual llegó (si se pudo parsear), para guardarlo como evidencia. */
  crudo: unknown
  /** Solo si el status es 200 y el payload pasó el esquema. */
  metricas: MetricasV1 | null
  error: string | null
}

type Env = Record<string, string | undefined>

/**
 * URL y token de un SaaS, SIEMPRE el par de la misma clave: MONITOREO_URL_<CLAVE>
 * y MONITOREO_TOKEN_<CLAVE>. La base solo nombra la clave; adónde va cada token
 * lo decide quien configura el deploy, no quien puede editar una tabla.
 */
export function credencialesDe(clave: string, env: Env = process.env): { url: URL; token: string } | { error: string } {
  if (!CLAVE_RE.test(clave)) return { error: 'Clave de SaaS no válida' }
  const url = env[`MONITOREO_URL_${clave}`]
  const token = env[`MONITOREO_TOKEN_${clave}`]
  if (!url || !token) return { error: `Faltan MONITOREO_URL_${clave} o MONITOREO_TOKEN_${clave}` }
  const validada = validarUrlPublica(url)
  if ('error' in validada) return validada
  return { url: validada.url, token }
}

/**
 * Aunque la URL venga del entorno, se exige un destino público y nombrado:
 * https, sin credenciales, sin query, y un hostname con punto que no sea
 * localhost, una IP literal (v4 o v6) ni un sufijo de red interna. Las IP
 * literales se rechazan todas, públicas incluidas: un SaaS real tiene dominio.
 *
 * No resuelve DNS: un dominio que apunte a una IP privada no se detecta aquí.
 * El dominio lo fija el deploy, no un usuario.
 */
export function validarUrlPublica(texto: string): { url: URL } | { error: string } {
  let url: URL
  try {
    url = new URL(texto)
  } catch {
    return { error: 'URL del SaaS mal formada' }
  }
  if (url.protocol !== 'https:') return { error: 'La URL del SaaS debe ser https' }
  if (url.username || url.password) return { error: 'La URL del SaaS no puede llevar credenciales' }
  if (url.search || url.hash) return { error: 'La URL del SaaS no puede llevar query ni fragmento' }
  const host = url.hostname.toLowerCase()
  if (host.startsWith('[') || host.includes(':')) return { error: 'La URL del SaaS no puede ser una IP' }
  // WHATWG normaliza 0x7f.1, 2130706433, etc. a forma decimal con puntos: este chequeo los cubre.
  if (/^[0-9.]+$/.test(host)) return { error: 'La URL del SaaS no puede ser una IP' }
  if (!host.includes('.') || host.endsWith('.')) return { error: 'La URL del SaaS necesita un dominio público' }
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) {
    return { error: 'La URL del SaaS apunta a una red interna' }
  }
  // Solo el origen: con ruta, `//otro-dominio` en el pathname haría que el Bearer saliera a otro host.
  if (url.pathname !== '/') return { error: 'La URL del SaaS debe ser solo el dominio, sin ruta' }
  return { url }
}

/**
 * Pide `GET {MONITOREO_URL_<clave>}/api/ops/metrics` y valida la respuesta.
 * Nunca lanza: todo resultado (incluida la falla) se devuelve para guardarlo.
 *
 * `redirect: 'error'`: un redirect mandaría el Bearer a otro destino.
 */
export async function pedirMetricas(
  clave: string,
  fetchImpl: typeof fetch = fetch,
  env: Env = process.env,
): Promise<ResultadoPull> {
  const cred = credencialesDe(clave, env)
  if ('error' in cred) return falla(0, cred.error)

  const destino = new URL('/api/ops/metrics', cred.url.origin)
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetchImpl(destino, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cred.token}`, Accept: 'application/json' },
        redirect: 'error',
        cache: 'no-store',
        signal: control.signal,
      })
    } catch {
      return falla(0, control.signal.aborted ? `Sin respuesta en ${TIMEOUT_MS / 1000} s` : 'No se pudo conectar')
    }

    const cuerpo = await leerAcotado(res, control)
    if ('error' in cuerpo) return falla(res.status, cuerpo.error)
    const crudo = parsear(cuerpo.texto)
    if (res.status !== 200) return { httpStatus: res.status, crudo, metricas: null, error: `HTTP ${res.status}` }
    if (crudo === undefined) return falla(200, 'La respuesta no es JSON')

    const validado = MetricasV1Schema.safeParse(crudo)
    if (!validado.success) {
      const issue = validado.error.issues[0]
      return {
        httpStatus: 200,
        crudo,
        metricas: null,
        error: `Payload inválido: ${issue?.path.join('.') || '(raíz)'} ${issue?.message ?? ''}`.slice(0, 500),
      }
    }
    return { httpStatus: 200, crudo, metricas: validado.data, error: null }
  } finally {
    clearTimeout(reloj)
  }
}

/** Lee el cuerpo por partes y corta apenas pasa MAX_BYTES; el timeout también lo corta. */
async function leerAcotado(res: Response, control: AbortController): Promise<{ texto: string } | { error: string }> {
  const largo = Number(res.headers.get('content-length') ?? '')
  if (Number.isFinite(largo) && largo > MAX_BYTES) {
    control.abort()
    await res.body?.cancel().catch(() => undefined)
    return { error: 'Respuesta demasiado grande' }
  }
  if (!res.body) return { texto: '' }

  const lector = res.body.getReader()
  const partes: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) {
        control.abort()
        await lector.cancel().catch(() => undefined)
        return { error: 'Respuesta demasiado grande' }
      }
      partes.push(value)
    }
  } catch {
    return { error: control.signal.aborted ? `Sin respuesta en ${TIMEOUT_MS / 1000} s` : 'Se cortó la respuesta' }
  }
  const junto = new Uint8Array(total)
  let offset = 0
  for (const p of partes) {
    junto.set(p, offset)
    offset += p.byteLength
  }
  return { texto: new TextDecoder().decode(junto) }
}

function parsear(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return undefined
  }
}

function falla(httpStatus: number, error: string): ResultadoPull {
  return { httpStatus, crudo: undefined, metricas: null, error }
}
