import { describe, expect, test } from 'vitest'
import { pareceMarkdown, parsearInline, parsearMarkdown } from './mini'

describe('parsearInline', () => {
  test('separa negrita del texto que la rodea', () => {
    expect(parsearInline('el **funnel** anda')).toEqual([
      { tipo: 'texto', texto: 'el ' },
      { tipo: 'fuerte', texto: 'funnel' },
      { tipo: 'texto', texto: ' anda' },
    ])
  })

  test('reconoce código, itálica y tachado', () => {
    expect(parsearInline('`npm test` _ojo_ ~~no~~')).toEqual([
      { tipo: 'codigo', texto: 'npm test' },
      { tipo: 'texto', texto: ' ' },
      { tipo: 'enfasis', texto: 'ojo' },
      { tipo: 'texto', texto: ' ' },
      { tipo: 'tachado', texto: 'no' },
    ])
  })

  test('conserva el enlace con href navegable', () => {
    expect(parsearInline('ver [el PR](https://github.com/x/y/pull/31)')).toEqual([
      { tipo: 'texto', texto: 'ver ' },
      { tipo: 'enlace', texto: 'el PR', href: 'https://github.com/x/y/pull/31' },
    ])
  })

  test('degrada a texto un enlace con esquema no navegable', () => {
    // El contenido viene de Discord: un javascript: no puede llegar a un href.
    expect(parsearInline('[click](javascript:alert(1))')).toEqual([{ tipo: 'texto', texto: 'click' }])
  })

  test('devuelve texto plano cuando no hay formato', () => {
    expect(parsearInline('sin nada especial')).toEqual([{ tipo: 'texto', texto: 'sin nada especial' }])
  })
})

describe('parsearMarkdown', () => {
  test('arma títulos, listas y párrafos', () => {
    const bloques = parsearMarkdown('# Decisiones\n\n- Cerrar el bridge\n- Deploy manual\n\nQuedó firmado.')
    expect(bloques.map((b) => b.tipo)).toEqual(['titulo', 'lista', 'parrafo'])
    expect(bloques[1]).toMatchObject({ tipo: 'lista', ordenada: false })
  })

  test('distingue lista ordenada', () => {
    const [bloque] = parsearMarkdown('1. Primero\n2. Segundo')
    expect(bloque).toMatchObject({ tipo: 'lista', ordenada: true })
    expect(bloque.tipo === 'lista' && bloque.items).toHaveLength(2)
  })

  test('respeta el bloque de código sin interpretarlo', () => {
    const [bloque] = parsearMarkdown('```sql\nSELECT **1**\n```')
    expect(bloque).toEqual({ tipo: 'codigo', texto: 'SELECT **1**', lenguaje: 'sql' })
  })

  test('cierra el bloque de código aunque falte el cierre', () => {
    const [bloque] = parsearMarkdown('```\nsin cerrar')
    expect(bloque).toEqual({ tipo: 'codigo', texto: 'sin cerrar', lenguaje: null })
  })

  test('junta la cita de varias líneas', () => {
    const [bloque] = parsearMarkdown('> primera\n> segunda')
    expect(bloque).toMatchObject({ tipo: 'cita' })
    expect(bloque.tipo === 'cita' && bloque.contenido).toEqual([{ tipo: 'texto', texto: 'primera segunda' }])
  })

  test('el separador es su propio bloque', () => {
    expect(parsearMarkdown('uno\n\n---\n\ndos').map((b) => b.tipo)).toEqual([
      'parrafo',
      'separador',
      'parrafo',
    ])
  })

  test('texto vacío no produce bloques', () => {
    expect(parsearMarkdown('\n\n  \n')).toEqual([])
  })
})

describe('pareceMarkdown', () => {
  test('detecta marcas reales', () => {
    expect(pareceMarkdown('- un item')).toBe(true)
    expect(pareceMarkdown('esto es **fuerte**')).toBe(true)
    expect(pareceMarkdown('ver [acá](https://tryvex.tech)')).toBe(true)
  })

  test('no se activa con texto corriente', () => {
    expect(pareceMarkdown('Llamé al cliente y quedó de responder mañana.')).toBe(false)
  })
})
