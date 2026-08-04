import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Credenciales de los agentes del equipo (Jarvis, Ariel, Spike).
 *
 * Un agente no tiene navegador ni sesión: corre como servicio y no puede pasar
 * por el login del CRM. Se identifica con un token que se genera una vez, se
 * muestra una vez, y del que la base solo guarda el hash — si mañana alguien lee
 * la tabla entera, no se lleva ninguna llave.
 */

const PREFIJO = 'txa_'

/** Token nuevo en claro. Es la única vez que existe legible. */
export function generarToken(): string {
  return PREFIJO + randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Comparación de tiempo constante: con `===` el tiempo de respuesta filtra
 * cuántos caracteres coinciden, y eso permite adivinar el token de a poco.
 */
export function tokenCoincide(candidato: string, hashGuardado: string): boolean {
  const a = Buffer.from(hashToken(candidato), 'hex')
  const b = Buffer.from(hashGuardado, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Saca el token del header `Authorization: Bearer <token>`. */
export function tokenDeCabecera(req: Request): string | null {
  const cabecera = req.headers.get('authorization') ?? ''
  const [esquema, valor] = cabecera.split(' ')
  if (esquema?.toLowerCase() !== 'bearer' || !valor) return null
  return valor.trim() || null
}
