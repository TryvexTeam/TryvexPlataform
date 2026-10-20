import { MetricasV1Schema, type MetricasV1 } from './esquema'

export const TIMEOUT_MS = 10_000
/** La respuesta legítima pesa unos KB; 1 MB ya es otra cosa. */
const MAX_BYTES = 1_000_000
const TOKEN_ENV_RE = /^MONITOREO_TOKEN_[A-Z0-9_]+$/

export interface ResultadoPull {
  /** 0 = sin respuesta HTTP. */
  httpStatus: number
  /** JSON tal cual llegó (si se pudo parsear), para guardarlo como evidencia. */
  crudo: unknown
  /** Solo si el status es 200 y el payload pasó el esquema. */
  metricas: MetricasV1 | null
  error: string | null
}

/**
 * Pide `GET {baseUrl}/api/ops/metrics` y valida la respuesta. Nunca lanza: todo
 * resultado (incluida la falla) se devuelve para guardarlo como snapshot.
 *
 * `redirect: 'error'`: un redirect mandaría el Bearer a otro destino.
 */
export async function pedirMetricas(
  baseUrl: string,
  tokenEnv: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoPull> {
  if (!TOKEN_ENV_RE.test(tokenEnv)) return falla(0, 'token_env con nombre no permitido')
  const token = process.env[tokenEnv]
  if (!token) return falla(0, `Falta la variable de entorno ${tokenEnv}`)

  let res: Response
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/ops/metrics`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const nombre = e instanceof Error ? e.name : ''
    return falla(0, nombre === 'TimeoutError' ? `Sin respuesta en ${TIMEOUT_MS / 1000} s` : 'No se pudo conectar')
  }

  const texto = await res.text().catch(() => '')
  if (texto.length > MAX_BYTES) return falla(res.status, 'Respuesta demasiado grande')
  const crudo = parsear(texto)
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
