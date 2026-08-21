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

/**
 * TTL por defecto de un token de agente. Hallazgo de auditoría (agosto 2026):
 * los tokens no expiraban nunca. 90 días fuerza una rotación periódica sin
 * exigir que alguien se acuerde de hacerlo a mano.
 *
 * Rate limiting: ver `lib/agentes/rate-limit.ts` — versión mínima en memoria
 * del propio proceso (60 req/min por agente), ya conectada en las 4 rutas de
 * `/api/agentes/*`. TODO pendiente si esto crece a más de un proceso/región:
 * mover a Redis/Upstash o una tabla Postgres con ventana propia — la versión
 * en memoria no coordina entre procesos ni sobrevive un restart.
 */
export const TTL_DIAS_AGENTE = 90

export function expiracionDesdeAhora(): string {
  return new Date(Date.now() + TTL_DIAS_AGENTE * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * `null`/`undefined` en `expira_at` se trata como "no expira": son los agentes
 * creados antes de esta migración, que no tienen fecha y no hay que romper de
 * golpe. Los agentes nuevos siempre llevan `expira_at` (ver expiracionDesdeAhora).
 */
export function tokenExpirado(expiraAt: string | null | undefined): boolean {
  if (!expiraAt) return false
  return new Date(expiraAt).getTime() < Date.now()
}

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
