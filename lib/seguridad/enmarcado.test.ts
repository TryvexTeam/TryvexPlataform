import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

/**
 * El visor de adjuntos del chat necesita poder dibujarse dentro de un marco.
 *
 * El 26-ago-2026 una auditoría de seguridad puso `X-Frame-Options: DENY` en
 * `/:path*` y con eso alcanzó al endpoint que sirve los adjuntos — que existe
 * justamente para mostrarse enmarcado. La vista previa de HTML y PDF quedó en
 * blanco con un "ha rechazado la conexión", sin error en consola ni en el
 * servidor. Nadie lo notó hasta el 13-sep.
 *
 * Estas pruebas fijan las dos mitades de la regla, para que el próximo
 * endurecimiento de cabeceras falle acá y no en la pantalla de alguien.
 */

type Cabecera = { key: string; value: string }
type Regla = { source: string; headers: Cabecera[] }

async function reglas(): Promise<Regla[]> {
  const h = nextConfig.headers
  if (!h) throw new Error('next.config ya no define headers()')
  return (await h()) as Regla[]
}

/** ¿La regla de `source` alcanza a esta ruta? Evalúa el patrón como regex. */
function alcanza(source: string, ruta: string): boolean {
  const patron = source
    .replace(/\/:path\*/g, '/.*')
    .replace(/\/:[a-zA-Z]+/g, '/[^/]+')
  try {
    return new RegExp('^' + patron + '$').test(ruta)
  } catch {
    return false
  }
}

describe('cabeceras de enmarcado', () => {
  it('el CRM sigue protegido contra clickjacking', async () => {
    const rs = await reglas()
    const deny = rs
      .filter((r) => alcanza(r.source, '/leads'))
      .flatMap((r) => r.headers)
      .filter((h) => h.key === 'X-Frame-Options' && h.value === 'DENY')
    expect(deny.length).toBeGreaterThan(0)
  })

  it('el endpoint de adjuntos NO queda bajo DENY', async () => {
    // Ésta es la que importa: con DENY, la vista previa del chat muere.
    const rs = await reglas()
    const deny = rs
      .filter((r) => alcanza(r.source, '/api/chat/adjuntos/abc123'))
      .flatMap((r) => r.headers)
      .filter((h) => h.key === 'X-Frame-Options' && h.value === 'DENY')
    expect(deny).toHaveLength(0)
  })

  it('el endpoint de adjuntos se deja enmarcar solo desde el mismo origen', async () => {
    const rs = await reglas()
    const xfo = rs
      .filter((r) => alcanza(r.source, '/api/chat/adjuntos/abc123'))
      .flatMap((r) => r.headers)
      .find((h) => h.key === 'X-Frame-Options')
    expect(xfo?.value).toBe('SAMEORIGIN')
  })

  it('los adjuntos conservan el resto del endurecimiento', async () => {
    // Quitar el DENY no puede haber quitado lo demás de la auditoría.
    const rs = await reglas()
    const claves = rs
      .filter((r) => alcanza(r.source, '/api/chat/adjuntos/abc123'))
      .flatMap((r) => r.headers)
      .map((h) => h.key)
    expect(claves).toContain('X-Content-Type-Options')
    expect(claves).toContain('Referrer-Policy')
    expect(claves).toContain('Strict-Transport-Security')
  })
})
