import { describe, it, expect } from 'vitest'
import { esImagen, esTexto, esPdf, esHtml, type AdjuntoMensaje } from './chat'

const adj = (nombre: string, tipo_mime: string): AdjuntoMensaje => ({
  id: 'x',
  nombre,
  tipo_mime,
  bytes: 100,
  ancho: null,
  alto: null,
})

describe('esPdf', () => {
  it('reconoce por tipo MIME', () =>
    expect(esPdf(adj('cotizacion.pdf', 'application/pdf'))).toBe(true))

  it('reconoce por extensión aunque el MIME sea genérico', () =>
    expect(esPdf(adj('informe.PDF', 'application/octet-stream'))).toBe(true))

  it('no confunde una imagen con un PDF', () =>
    expect(esPdf(adj('foto.png', 'image/png'))).toBe(false))

  it('no le basta que el nombre contenga "pdf"', () =>
    expect(esPdf(adj('pdf-notas.txt', 'text/plain'))).toBe(false))
})

describe('las tres categorías no se pisan', () => {
  it('un PDF no es texto ni imagen', () => {
    const pdf = adj('doc.pdf', 'application/pdf')
    expect(esPdf(pdf)).toBe(true)
    expect(esTexto(pdf)).toBe(false)
    expect(esImagen(pdf)).toBe(false)
  })

  it('un .md sigue siendo texto', () => {
    const md = adj('notas.md', 'application/octet-stream')
    expect(esTexto(md)).toBe(true)
    expect(esPdf(md)).toBe(false)
  })
})

describe('esHtml', () => {
  it('reconoce por tipo MIME', () =>
    expect(esHtml(adj('pagina.html', 'text/html'))).toBe(true))

  it('reconoce .htm y mayúsculas', () =>
    expect(esHtml(adj('VIEJA.HTM', 'application/octet-stream'))).toBe(true))

  it('no confunde un .txt con una página', () =>
    expect(esHtml(adj('notas.txt', 'text/plain'))).toBe(false))

  it('un HTML también cuenta como texto: por eso el orden importa', () => {
    const pagina = adj('prueba.html', 'text/html')
    expect(esHtml(pagina)).toBe(true)
    expect(esTexto(pagina)).toBe(true)
  })

  it('no es imagen ni PDF', () => {
    const pagina = adj('prueba.html', 'text/html')
    expect(esImagen(pagina)).toBe(false)
    expect(esPdf(pagina)).toBe(false)
  })
})
