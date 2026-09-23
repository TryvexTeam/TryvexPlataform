// La llave de un agente: su token. Lo comparten el puente (puente-agente.mjs)
// y el servidor MCP (mcp-tryvex.mjs), para que las dos puertas cierren igual.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CRM_POR_DEFECTO = 'https://tryvexplataform.vercel.app'

/** @param {Record<string, string | undefined>} [env] */
export function urlCrm(env = process.env) {
  return (env.TRYVEX_CRM_URL || CRM_POR_DEFECTO).replace(/\/+$/, '')
}

/**
 * El token del agente: de TRYVEX_AGENTE_TOKEN o de un archivo. Devuelve
 * también un aviso si el archivo lo pueden leer otros usuarios de la máquina
 * (en Windows los permisos no se leen así, y no se avisa).
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function leerToken(env = process.env) {
  if (env.TRYVEX_AGENTE_TOKEN?.trim()) return { token: env.TRYVEX_AGENTE_TOKEN.trim(), archivo: null, aviso: null }
  const archivo = env.TRYVEX_TOKEN_FILE || join(homedir(), '.claude', '.tryvex-agente-token')
  if (!existsSync(archivo)) return { token: null, archivo, aviso: null }
  let aviso = null
  if (process.platform !== 'win32' && (statSync(archivo).mode & 0o077) !== 0) {
    aviso = `el archivo del token lo pueden leer otros usuarios: chmod 600 ${archivo}`
  }
  return { token: readFileSync(archivo, 'utf8').trim() || null, archivo, aviso }
}

/**
 * ¿Esta ruta es de la API de agentes? Es el cerrojo del MCP: un modelo puede
 * pedir cualquier ruta, y el token solo debe salir hacia /api/agentes/…, nunca
 * hacia otra parte del CRM ni hacia otro dominio.
 */
export function rutaPermitida(ruta) {
  if (typeof ruta !== 'string' || ruta.length > 300) return false
  if (/\.\.|\/\/|\\|@|#|%2e|%2f|%5c/i.test(ruta)) return false
  return /^\/api\/agentes(\/[a-z0-9-]+)*\/?(\?[A-Za-z0-9_=&.,:+-]*)?$/.test(ruta)
}

/** Nada que parezca un token sale en una respuesta, aunque el CRM lo devolviera. */
export function sinTokens(texto) {
  return texto.replace(/txa_[A-Za-z0-9_-]{8,}/g, 'txa_[oculto]')
}
