import { describe, expect, test } from 'vitest'
import { pareceMarkdown, parsearInline, parsearMarkdown, textoPlano } from './mini'

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

describe('textoPlano', () => {
  test('quita las marcas para la vista previa del chat', () => {
    expect(textoPlano('**Listo** el _deploy_')).toBe('Listo el deploy')
  })

  test('aplana una lista en una línea', () => {
    expect(textoPlano('- uno\n- dos')).toBe('uno · dos')
  })

  test('conserva el texto de un enlace, no la URL', () => {
    expect(textoPlano('mirá [el PR](https://github.com/x/y/pull/1)')).toBe('mirá el PR')
  })
})

describe('sabor chat (Discord)', () => {
  test('respeta cada salto de línea en vez de juntar las líneas', () => {
    const [bloque] = parsearMarkdown('primera\nsegunda', { chat: true })
    expect(bloque).toMatchObject({ tipo: 'parrafo' })
    expect(bloque.tipo === 'parrafo' && bloque.contenido).toEqual([
      { tipo: 'texto', texto: 'primera' },
      { tipo: 'salto', texto: '' },
      { tipo: 'texto', texto: 'segunda' },
    ])
  })

  test('sin modo chat las junta, como manda markdown', () => {
    const [bloque] = parsearMarkdown('primera\nsegunda')
    expect(bloque.tipo === 'parrafo' && bloque.contenido).toEqual([
      { tipo: 'texto', texto: 'primera segunda' },
    ])
  })

  test('enlaza una URL escrita a secas', () => {
    expect(parsearInline('mirá https://tryvex.tech')).toEqual([
      { tipo: 'texto', texto: 'mirá ' },
      { tipo: 'enlace', texto: 'https://tryvex.tech', href: 'https://tryvex.tech' },
    ])
  })

  test('deja fuera del enlace el punto final de la oración', () => {
    expect(parsearInline('anda https://tryvex.tech.')).toEqual([
      { tipo: 'texto', texto: 'anda ' },
      { tipo: 'enlace', texto: 'https://tryvex.tech', href: 'https://tryvex.tech' },
      { tipo: 'texto', texto: '.' },
    ])
  })

  test('no toca la URL que ya viene dentro de un enlace con texto', () => {
    expect(parsearInline('[el sitio](https://tryvex.tech)')).toEqual([
      { tipo: 'enlace', texto: 'el sitio', href: 'https://tryvex.tech' },
    ])
  })

  test('reconoce el spoiler', () => {
    expect(parsearInline('la clave es ||1234||')).toEqual([
      { tipo: 'texto', texto: 'la clave es ' },
      { tipo: 'spoiler', texto: '1234' },
    ])
  })

  test('la vista previa no revela el spoiler', () => {
    expect(textoPlano('la clave es ||1234||')).toBe('la clave es ▮▮▮')
  })
})

describe('tablas', () => {
  const TABLA = `| Paso | Estado |
|---|---|
| Base del VPS | acá voy |
| Migrar scraper | pendiente |`

  test('reconoce encabezados y filas', () => {
    const [bloque] = parsearMarkdown(TABLA)
    expect(bloque.tipo).toBe('tabla')
    if (bloque.tipo !== 'tabla') return
    expect(bloque.encabezados).toHaveLength(2)
    expect(bloque.filas).toHaveLength(2)
    expect(bloque.encabezados[0]).toEqual([{ tipo: 'texto', texto: 'Paso' }])
    expect(bloque.filas[1][1]).toEqual([{ tipo: 'texto', texto: 'pendiente' }])
  })

  test('acepta filas sin las barras de los extremos', () => {
    const [bloque] = parsearMarkdown('a | b\n--- | ---\n1 | 2')
    expect(bloque.tipo).toBe('tabla')
    if (bloque.tipo !== 'tabla') return
    expect(bloque.filas[0].map((c) => c[0]?.texto)).toEqual(['1', '2'])
  })

  test('respeta la alineación en el separador', () => {
    const [bloque] = parsearMarkdown('| a | b |\n|:--|--:|\n| 1 | 2 |')
    expect(bloque.tipo).toBe('tabla')
  })

  test('una barra suelta no convierte el texto en tabla', () => {
    const [bloque] = parsearMarkdown('esto | aquello es texto normal')
    expect(bloque.tipo).toBe('parrafo')
  })

  test('el formato dentro de una celda se conserva', () => {
    const [bloque] = parsearMarkdown('| x |\n|---|\n| **listo** |')
    if (bloque.tipo !== 'tabla') throw new Error('no es tabla')
    expect(bloque.filas[0][0]).toEqual([{ tipo: 'fuerte', texto: 'listo' }])
  })

  test('la vista previa aplana la tabla', () => {
    expect(textoPlano(TABLA)).toContain('Paso · Estado')
  })
})
