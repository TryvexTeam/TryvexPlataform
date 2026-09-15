import { describe, it, expect } from 'vitest'
import { textoSugerido } from './texto-sugerido'

// Las dos plantillas fijas que esto reemplaza afirmaban, a TODOS los leads:
//   "Ayudamos a negocios como el tuyo ... con una página web lista en días"
//   "Vimos que {negocio} todavía no tiene sitio web"
// Sin mirar un solo dato. El 15-sep estuvimos toda la tarde sacando eso mismo
// del redactor con IA mientras acá estaba escrito a mano.

const base = {
  nombre_negocio: 'Ópticas Premium',
  tiene_web: null as boolean | null,
  url_web: null as string | null,
  google_rating: null as number | null,
  google_resenas: null as number | null,
}

describe('textoSugerido', () => {
  it('SIEMPRE saluda preguntando por el negocio, con su nombre', () => {
    expect(textoSugerido(base)).toContain('¿hablo con Ópticas Premium?')
  })

  it('si no sabemos de su web, NO la menciona ni se la ofrece', () => {
    const t = textoSugerido({ ...base, url_web: 'https://opticaspremium.com' })
    expect(t).not.toMatch(/página|pagina|sitio|web lista/i)
    expect(t).not.toMatch(/no tiene|todavía no/i)
  })

  it('un "sin web" con URL al lado NO se trata como sin web', () => {
    // El formulario de alta traía `tiene_web: false` por defecto: ese false
    // parece medido y no lo es.
    const t = textoSugerido({ ...base, tiene_web: false, url_web: 'https://x.cl' })
    expect(t).not.toMatch(/páginas web|sitio/i)
  })

  it('cuando SÍ sabemos que no tiene web, ofrecérsela es correcto', () => {
    const t = textoSugerido({ ...base, tiene_web: false, url_web: null })
    expect(t).toMatch(/páginas web/i)
  })

  it('con reputación, la usa: es lo único real y suyo que tenemos', () => {
    const t = textoSugerido({ ...base, google_rating: 4.2, google_resenas: 21 })
    expect(t).toContain('21 reseñas')
    expect(t).toContain('4,2 estrellas') // coma decimal, como se escribe acá
  })

  it('con solo reseñas, no inventa la calificación', () => {
    const t = textoSugerido({ ...base, google_resenas: 21 })
    expect(t).toContain('21 reseñas')
    expect(t).not.toContain('estrellas')
  })

  it('sin ningún dato, no afirma nada: pregunta', () => {
    const t = textoSugerido(base)
    expect(t).not.toMatch(/página|pagina|sitio|estrellas|reseñas/i)
    expect(t).toContain('?')
  })

  it('nunca dice "negocios como el tuyo" cuando hay un dato suyo', () => {
    const t = textoSugerido({ ...base, google_rating: 4.2, google_resenas: 21 })
    expect(t).not.toContain('negocios como el tuyo')
  })

  it('sin nombre, no escribe "null" ni queda cojo', () => {
    const t = textoSugerido({ ...base, nombre_negocio: null })
    expect(t).toContain('tu negocio')
    expect(t).not.toContain('null')
  })
})
