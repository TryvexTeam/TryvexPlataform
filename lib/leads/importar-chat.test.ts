import { describe, expect, it } from 'vitest'
import { leerChatExportado } from './importar-chat'

describe('leerChatExportado — el .txt que exporta WhatsApp', () => {
  it('Android en español, 24 h', () => {
    const r = leerChatExportado(
      '28/09/26, 16:04 - Ignacio: Hola, ¿hablo con La Mesa?\n' +
        '28/09/26, 16:06 - Juan La Mesa: Sí, dígame',
    )
    expect(r.mensajes).toEqual([
      { autor: 'Ignacio', texto: 'Hola, ¿hablo con La Mesa?', ocurridoAt: '2026-09-28T19:04:00.000Z' },
      { autor: 'Juan La Mesa', texto: 'Sí, dígame', ocurridoAt: '2026-09-28T19:06:00.000Z' },
    ])
    expect(r.autores).toEqual(['Ignacio', 'Juan La Mesa'])
  })

  it('iPhone, con corchetes, segundos y la marca invisible del principio', () => {
    const r = leerChatExportado('‎[28/09/2026, 16:04:12] Ignacio: Hola')
    expect(r.mensajes).toEqual([{ autor: 'Ignacio', texto: 'Hola', ocurridoAt: '2026-09-28T19:04:12.000Z' }])
  })

  it('Android en 12 h (p. m. / a. m.)', () => {
    const r = leerChatExportado('28/9/26, 4:04 p. m. - Ignacio: Hola\n1/10/26, 12:15 a. m. - Juan: tarde')
    expect(r.mensajes.map((m) => m.ocurridoAt)).toEqual(['2026-09-28T19:04:00.000Z', '2026-10-01T03:15:00.000Z'])
  })

  it('un mensaje de varias líneas queda en un solo mensaje', () => {
    const r = leerChatExportado('28/09/26, 16:04 - Juan: Primera línea\nsegunda línea\n\ntercera')
    expect(r.mensajes).toHaveLength(1)
    expect(r.mensajes[0].texto).toBe('Primera línea\nsegunda línea\n\ntercera')
  })

  it('los avisos del sistema no son mensajes de nadie', () => {
    const r = leerChatExportado(
      '28/09/26, 16:00 - Los mensajes y las llamadas están cifrados de extremo a extremo.\n' +
        '28/09/26, 16:04 - Juan: Hola',
    )
    expect(r.mensajes.map((m) => m.autor)).toEqual(['Juan'])
  })

  it('lo multimedia queda anotado, no se pierde ni se inventa', () => {
    const r = leerChatExportado('28/09/26, 16:04 - Juan: <Multimedia omitido>')
    expect(r.mensajes[0].texto).toBe('[archivo o foto]')
  })

  it('texto que no es un chat exportado: no inventa mensajes y lo dice', () => {
    const r = leerChatExportado('hola que tal\nesto no tiene fechas')
    expect(r.mensajes).toEqual([])
    expect(r.lineasSinFecha).toBe(2)
  })
})
