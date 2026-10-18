import { describe, it, expect } from 'vitest'
import {
  analizarHilo,
  ciudad,
  derivarConversaciones,
  derivarTraspasos,
  hace,
  type LeadWa,
  type MensajeWa,
} from './derivar-whatsapp'

/**
 * Los casos salen de los datos reales del 22-sep-2026. El más importante es el
 * primero: la versión inicial contaba la prospección como "traspasos" y habría
 * mostrado 65 cuando hubo cero.
 */

const AHORA = new Date('2026-09-22T20:00:00Z').getTime()
const SPIKE = 'id-spike'
const idPorNombre = new Map([['spike', SPIKE]])

let n = 0
function msg(
  lead: string,
  direccion: 'in' | 'out',
  cuando: string,
  opciones: { bot?: boolean; por?: string; texto?: string } = {},
): MensajeWa {
  n += 1
  return {
    id: `m${n}`,
    lead_id: lead,
    direccion,
    texto: opciones.texto ?? `texto ${n}`,
    es_bot: direccion === 'out' ? (opciones.bot ?? false) : false,
    enviado_por: direccion === 'out' ? (opciones.por ?? (opciones.bot ? 'Spike' : 'Joseph Maillens')) : null,
    created_at: cuando,
  }
}

function lead(id: string, extra: Partial<LeadWa> = {}): LeadWa {
  return {
    id,
    nombre_negocio: `Negocio ${id}`,
    nombre_contacto: null,
    telefono: '+56900000000',
    nicho: 'florería',
    localidad: 'Ñuñoa',
    estado: 'contactado',
    wa_leido_hasta: null,
    web_capacidades: { capacidades: ['carrito', 'formulario'] },
    ...extra,
  }
}

const leads = new Map(['a', 'b', 'c', 'd'].map((id) => [id, lead(id)]))

describe('prospección: el equipo escribe y nadie contesta', () => {
  const mensajes = [
    msg('a', 'out', '2026-09-16T12:00:00Z'),
    msg('a', 'out', '2026-09-17T12:00:00Z'),
  ]

  it('no es una conversación: del otro lado nadie habló', () => {
    expect(derivarConversaciones(mensajes, leads, idPorNombre, AHORA)).toHaveLength(0)
  })

  it('no es un traspaso, aunque haya escrito una persona', () => {
    expect(derivarTraspasos(mensajes, leads, idPorNombre, AHORA)).toHaveLength(0)
  })
})

describe('el bot atiende y resuelve solo', () => {
  const mensajes = [
    msg('b', 'out', '2026-09-16T12:00:00Z'), // el equipo prospecta
    msg('b', 'in', '2026-09-16T13:00:00Z'), // el cliente responde
    msg('b', 'out', '2026-09-16T13:00:16Z', { bot: true }), // el bot contesta
  ]

  it('es una conversación en modo AI, atribuida al agente que respondió', () => {
    const [c] = derivarConversaciones(mensajes, leads, idPorNombre, AHORA)
    expect(c.modo).toBe('AI')
    expect(c.agenteId).toBe(SPIKE)
  })

  it('una persona que escribió ANTES del bot no cuenta como traspaso', () => {
    expect(analizarHilo(mensajes).humanosTrasBot).toHaveLength(0)
    expect(derivarTraspasos(mensajes, leads, idPorNombre, AHORA)).toHaveLength(0)
  })

  it('el hilo distingue cliente, agente y persona', () => {
    const [c] = derivarConversaciones(mensajes, leads, idPorNombre, AHORA)
    const de = c.hilo.map((e) => (e.clase === 'mensaje' ? e.de : null))
    expect(de).toEqual(['persona', 'cliente', 'agente'])
  })
})

describe('una persona toma el control después del bot', () => {
  const mensajes = [
    msg('c', 'in', '2026-09-20T10:00:00Z'),
    msg('c', 'out', '2026-09-20T10:00:20Z', { bot: true, texto: 'Hola, ¿en qué te ayudo?' }),
    msg('c', 'in', '2026-09-20T10:05:00Z'),
    msg('c', 'out', '2026-09-20T10:30:00Z', { por: 'Ignacio Andres Navarrete Silva' }),
  ]

  it('la conversación pasa a modo HUMANO', () => {
    expect(derivarConversaciones(mensajes, leads, idPorNombre, AHORA)[0].modo).toBe('HUMANO')
  })

  it('es un traspaso tomado, con quién lo tomó y lo que el bot ya dijo', () => {
    const [t] = derivarTraspasos(mensajes, leads, idPorNombre, AHORA)
    expect(t.motivo).toBe('tomado_por_humano')
    expect(t.estado).toBe('tomado')
    expect(t.tomadoPor).toBe('Ignacio Andres Navarrete Silva')
    expect(t.clienteEsperando).toBe(false)
    expect(t.intentos[0]).toContain('Hola, ¿en qué te ayudo?')
  })

  it('pasada una semana sin movimiento se da por cerrado', () => {
    const [t] = derivarTraspasos(mensajes, leads, idPorNombre, AHORA + 10 * 86_400_000)
    expect(t.estado).toBe('cerrado')
  })
})

describe('el cliente escribió y nadie le contestó', () => {
  const mensajes = [
    msg('d', 'in', '2026-09-18T14:00:00Z'),
    msg('d', 'out', '2026-09-18T14:00:10Z', { bot: true }),
    msg('d', 'in', '2026-09-18T15:00:00Z'), // el proxy se cayó: nadie responde
    msg('d', 'in', '2026-09-18T16:00:00Z'),
  ]

  it('es un traspaso urgente: el cliente está esperando', () => {
    const [t] = derivarTraspasos(mensajes, leads, idPorNombre, AHORA)
    expect(t.motivo).toBe('sin_respuesta')
    expect(t.estado).toBe('esperando')
    expect(t.clienteEsperando).toBe(true)
  })

  it('espera desde el PRIMER mensaje sin contestar, no desde el último', () => {
    const [t] = derivarTraspasos(mensajes, leads, idPorNombre, AHORA)
    expect(t.desde).toBe('2026-09-18T15:00:00Z')
  })
})

describe('Ópticas Kairos: el cliente cierra después de nuestra despedida', () => {
  const mensajes = [
    msg('a', 'in', '2026-09-04T10:00:00Z', { texto: 'No me interesa muchas gracias' }),
    msg('a', 'out', '2026-09-04T10:01:00Z', { bot: true, texto: 'Eso, cuídate.' }),
    msg('a', 'in', '2026-09-04T10:02:00Z', { texto: 'El Señor me da y maneja todo según su voluntad 🙏' }),
  ]

  it('no produce un traspaso sin_respuesta por la bendición final', () => {
    expect(analizarHilo(mensajes).sinRespuesta).toBe(false)
    expect(derivarTraspasos(mensajes, leads, idPorNombre, AHORA)).toEqual([])
  })

  it('si luego pregunta, vuelve a esperar aunque el último mensaje sea un cierre', () => {
    const pendiente = [...mensajes,
      msg('a', 'in', '2026-09-04T10:03:00Z', { texto: '¿Hacen páginas web?' }),
      msg('a', 'in', '2026-09-04T10:04:00Z', { texto: 'Gracias 🙏🙏' }),
    ]
    expect(derivarTraspasos(pendiente, leads, idPorNombre, AHORA)[0].motivo).toBe('sin_respuesta')
  })
})

describe('Peluquería Época: despedida con emoji', () => {
  it('el emoji final no produce un traspaso sin_respuesta', () => {
    const mensajes = [
      msg('b', 'in', '2026-09-18T10:00:00Z', { texto: '¡Gracias, igualmente! Saludos.' }),
      msg('b', 'out', '2026-09-18T10:01:00Z', { bot: true, texto: '¡Gracias a ti! Saludos y que tengas un excelente día.' }),
      msg('b', 'in', '2026-09-18T10:02:00Z', { texto: '👋' }),
    ]
    expect(analizarHilo(mensajes).sinRespuesta).toBe(false)
    expect(derivarTraspasos(mensajes, leads, idPorNombre, AHORA)).toEqual([])
  })

  it('un emoji no oculta una pregunta anterior sin contestar', () => {
    const mensajes = [
      msg('b', 'in', '2026-09-18T10:00:00Z', { texto: 'gracias, ¿y cuánto sale?' }),
      msg('b', 'in', '2026-09-18T10:02:00Z', { texto: '👋' }),
    ]
    expect(derivarTraspasos(mensajes, leads, idPorNombre, AHORA)[0].motivo).toBe('sin_respuesta')
  })
})

describe('marca de lectura', () => {
  it('cuenta como sin leer solo lo que llegó después de la última lectura', () => {
    const conLectura = new Map([['e', lead('e', { wa_leido_hasta: '2026-09-21T10:00:00Z' })]])
    const mensajes = [
      msg('e', 'in', '2026-09-21T09:00:00Z'),
      msg('e', 'in', '2026-09-21T11:00:00Z'),
      msg('e', 'in', '2026-09-21T12:00:00Z'),
    ]
    expect(derivarConversaciones(mensajes, conLectura, idPorNombre, AHORA)[0].sinLeer).toBe(2)
  })
})

describe('hace', () => {
  it('habla en minutos, horas y días', () => {
    expect(hace('2026-09-22T19:55:00Z', AHORA)).toBe('hace 5 min')
    expect(hace('2026-09-22T17:00:00Z', AHORA)).toBe('hace 3 h')
    expect(hace('2026-09-20T20:00:00Z', AHORA)).toBe('hace 2 d')
  })
})

describe('ciudad', () => {
  it('saca la ciudad de una dirección completa de Google, sin el código postal', () => {
    expect(ciudad('Moneda 782, 8320328 Santiago, Región Metropolitana, Chile')).toBe('Santiago')
  })

  it('deja tal cual una comuna suelta', () => {
    expect(ciudad('Ñuñoa')).toBe('Ñuñoa')
  })

  it('no inventa nada si no hay localidad', () => {
    expect(ciudad(null)).toBeNull()
  })
})
