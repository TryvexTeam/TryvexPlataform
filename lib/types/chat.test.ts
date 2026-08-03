import { describe, expect, test } from 'vitest'
import { claveDm, tituloConversacion, type Conversacion, type MiembroChat } from './chat'

const YO = '11111111-1111-1111-1111-111111111111'
const OTRO = '22222222-2222-2222-2222-222222222222'

function miembro(id: string, nombre: string): MiembroChat {
  return { integrante_id: id, nombre, avatar_url: null, color: null, ultimo_leido_at: '2026-08-03T00:00:00Z' }
}

function conversacion(parcial: Partial<Conversacion>): Conversacion {
  return {
    id: 'c1',
    tipo: 'dm',
    nombre: null,
    ultimo_mensaje_at: '2026-08-03T00:00:00Z',
    miembros: [],
    ultimo_mensaje: null,
    no_leidos: 0,
    ...parcial,
  }
}

describe('claveDm', () => {
  test('da la misma clave sin importar el orden de los participantes', () => {
    expect(claveDm(YO, OTRO)).toBe(claveDm(OTRO, YO))
  })

  test('distingue pares distintos', () => {
    const tercero = '33333333-3333-3333-3333-333333333333'
    expect(claveDm(YO, OTRO)).not.toBe(claveDm(YO, tercero))
  })
})

describe('tituloConversacion', () => {
  test('en un DM muestra a la otra persona, no a uno mismo', () => {
    const conv = conversacion({
      tipo: 'dm',
      miembros: [miembro(YO, 'Ignacio'), miembro(OTRO, 'Cristian')],
    })
    expect(tituloConversacion(conv, YO)).toBe('Cristian')
  })

  test('en un grupo usa el nombre del grupo', () => {
    const conv = conversacion({
      tipo: 'grupo',
      nombre: 'Comercial',
      miembros: [miembro(YO, 'Ignacio'), miembro(OTRO, 'Cristian')],
    })
    expect(tituloConversacion(conv, YO)).toBe('Comercial')
  })

  test('cae en un texto neutro si el otro miembro todavía no cargó', () => {
    const conv = conversacion({ tipo: 'dm', miembros: [miembro(YO, 'Ignacio')] })
    expect(tituloConversacion(conv, YO)).toBe('Mensaje directo')
  })
})
