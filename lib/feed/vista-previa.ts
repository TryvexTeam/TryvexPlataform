import 'server-only'

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { VistaPrevia } from '@/lib/types/feed'

/**
 * La vista previa de un link (título, descripción, imagen), como la arman WhatsApp
 * o Discord: se lee el HTML y se sacan las etiquetas Open Graph.
 *
 * El servidor abre links que pegó cualquiera del equipo, así que se cuida de no
 * convertirse en un puente hacia adentro (SSRF): solo http(s) a puertos normales,
 * nada que resuelva a la red local o a la metadata de la nube, redirecciones
 * revisadas una por una, tope de tiempo y de bytes. Si algo falla, la publicación
 * queda igual, solo que sin vista previa.
 */

const TIEMPO_MAX_MS = 5000
const BYTES_MAX = 512 * 1024
const REDIRECCIONES_MAX = 3

const VACIA: VistaPrevia = { titulo: null, descripcion: null, imagen: null, sitio: null }

/** ¿La IP es de la red local, loopback, link-local o reservada? */
export function esIpPrivada(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local y metadata de la nube
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (v === 6) {
    const x = ip.toLowerCase()
    if (x === '::' || x === '::1') return true
    if (x.startsWith('::ffff:')) return esIpPrivada(x.slice(7))
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x)
  }
  return true // no es una IP: no se confía
}

/** Revisa la URL antes de abrirla. Devuelve el motivo si no se puede. */
export async function urlPermitida(url: string): Promise<string | null> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'url inválida'
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'protocolo no permitido'
  if (u.port && u.port !== '80' && u.port !== '443') return 'puerto no permitido'
  if (u.username || u.password) return 'credenciales en la url'
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'host interno'
  }
  if (isIP(host)) return esIpPrivada(host) ? 'ip privada' : null
  try {
    const direcciones = await lookup(host, { all: true })
    if (direcciones.length === 0 || direcciones.some((d) => esIpPrivada(d.address))) return 'resuelve a red privada'
  } catch {
    return 'no resuelve'
  }
  return null
}

function decodificar(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function meta(html: string, ...claves: string[]): string | null {
  for (const clave of claves) {
    const c = clave.replace(/[:.]/g, '\\$&')
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${c}["'][^>]*content=["']([^"']*)["']`, 'i')
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${c}["']`, 'i')
    const m = html.match(re1) ?? html.match(re2)
    if (m?.[1]) return decodificar(m[1])
  }
  return null
}

/** Saca la vista previa del HTML. Pura: se prueba sin red. */
export function extraerVistaPrevia(html: string, urlBase: string): VistaPrevia {
  const titulo = meta(html, 'og:title', 'twitter:title') ?? decodificar(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')
  const descripcion = meta(html, 'og:description', 'twitter:description', 'description')
  let imagen = meta(html, 'og:image', 'og:image:url', 'twitter:image')
  if (imagen) {
    try {
      const abs = new URL(imagen, urlBase)
      imagen = abs.protocol === 'https:' || abs.protocol === 'http:' ? abs.toString() : null
    } catch {
      imagen = null
    }
  }
  let sitio = meta(html, 'og:site_name')
  if (!sitio) {
    try {
      sitio = new URL(urlBase).hostname.replace(/^www\./, '')
    } catch {
      sitio = null
    }
  }
  const corto = (s: string | null, max: number) => (s ? s.slice(0, max) : null)
  return {
    titulo: corto(titulo || null, 300),
    descripcion: corto(descripcion, 500),
    imagen: corto(imagen, 2000),
    sitio: corto(sitio, 120),
  }
}

/** Abre el link con todos los cuidados y devuelve su vista previa (o una vacía). */
export async function obtenerVistaPrevia(url: string): Promise<VistaPrevia> {
  let actual = url
  try {
    for (let salto = 0; salto <= REDIRECCIONES_MAX; salto++) {
      if (await urlPermitida(actual)) return VACIA
      const res = await fetch(actual, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIEMPO_MAX_MS),
        headers: { 'User-Agent': 'TryvexBot/1.0 (vista previa de links)', Accept: 'text/html' },
      })
      if (res.status >= 300 && res.status < 400) {
        const destino = res.headers.get('location')
        if (!destino) return VACIA
        actual = new URL(destino, actual).toString()
        continue
      }
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html') || !res.body) return VACIA

      // Se lee solo hasta BYTES_MAX: las etiquetas van en el <head>.
      const lector = res.body.getReader()
      const partes: Uint8Array[] = []
      let total = 0
      while (total < BYTES_MAX) {
        const { done, value } = await lector.read()
        if (done || !value) break
        partes.push(value)
        total += value.length
      }
      await lector.cancel().catch(() => {})
      const html = new TextDecoder().decode(Buffer.concat(partes).subarray(0, BYTES_MAX))
      return extraerVistaPrevia(html, actual)
    }
  } catch {
    // Timeout, red caída, HTML raro: se publica sin vista previa.
  }
  return VACIA
}
