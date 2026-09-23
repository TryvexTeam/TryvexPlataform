import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { LeadsRepository } from '@/lib/repos/leads'
import { esCierre, esDespedidaPropia, esSoloEmoji, esperaRespuesta } from './cierre'

describe('caso exigido: gracias con emojis', () => {
  it('"Gracias 🙏🙏" es un cierre', () => {
    expect(esCierre('Gracias 🙏🙏')).toBe(true)
  })
})

describe('cierres puros, con la semántica de Vex-Agente', () => {
  it.each([
    '👋',
    'Gracias 🙏🙏',
    '¡Gracias a ti! Saludos y que tengas un excelente día.',
    '¡Gracias, igualmente! Saludos.',
  ])('reconoce %s', (texto) => expect(esCierre(texto)).toBe(true))

  it.each([
    'No me interesa muchas gracias',
    'gracias, ¿y cuánto sale?',
    '¿Hacen páginas web?',
    '',
    'El Señor me da y maneja todo según su voluntad 🙏',
  ])('no descarta contenido que requiere contexto: %s', (texto) => expect(esCierre(texto)).toBe(false))

  it('no guarda estado entre llamadas con el mismo emoji', () => {
    expect(esSoloEmoji('👋')).toBe(true)
    expect(esSoloEmoji('👋')).toBe(true)
    expect(esSoloEmoji(' ! ')).toBe(false)
    expect(esSoloEmoji('Hola 👋')).toBe(false)
  })

  it('reconoce la despedida propia de Kairos sin guardar estado', () => {
    expect(esDespedidaPropia('Eso, cuídate.')).toBe(true)
    expect(esDespedidaPropia('Eso, cuídate.')).toBe(true)
    expect(esDespedidaPropia('¿En qué le ayudo?')).toBe(false)
  })
})

describe('el turno completo determina si espera respuesta', () => {
  it('descarta cierres incluso si nunca hubo un saliente', () => {
    expect(esperaRespuesta(null, ['👋', 'Gracias 🙏🙏'])).toBe(false)
    expect(esperaRespuesta(null, [])).toBe(false)
    expect(esperaRespuesta(null, ['¿Hacen páginas web?'])).toBe(true)
  })

  it('una pregunta antes del emoji sigue pendiente aunque nos despidiéramos', () => {
    expect(esperaRespuesta('Eso, cuídate.', ['¿Hacen páginas web?', '👋'])).toBe(true)
  })

  it('una objeción antes del agradecimiento sigue pendiente', () => {
    expect(esperaRespuesta('Tenemos este servicio', ['No me interesa muchas gracias', '👋'])).toBe(true)
  })

  it('no supone que un adjunto sin texto sea un cierre', () => {
    expect(esperaRespuesta(null, [null])).toBe(true)
  })
})

describe('Por responder calculado por el repositorio en un solo pedido', () => {
  // El transporte simulado comprueba el pedido PostgREST real sin credenciales
  // ni acceso a la base. Los mensajes llegan en el orden descendente solicitado.
  const mensaje = (id: string, direccion: string, texto: string, hora: number) => ({
    id, direccion, texto, created_at: `2026-09-23T${String(hora).padStart(2, '0')}:00:00Z`,
  })

  it('descarta despedidas, conserva preguntas y envía solo la fecha del primer pendiente', async () => {
    const pedidos: URL[] = []
    const filas = [
      { id: 'kairos', mensajes_wa: [
        mensaje('k2', 'in', 'El Señor me da y maneja todo según su voluntad 🙏', 12),
        mensaje('k1', 'out', 'Eso, cuídate.', 11),
      ] },
      { id: 'epoca', mensajes_wa: [mensaje('e1', 'in', '👋', 12)] },
      { id: 'pregunta', mensajes_wa: [
        mensaje('p3', 'in', 'Gracias 🙏🙏', 12),
        mensaje('p2', 'in', '¿Hacen páginas web?', 10),
        mensaje('p1', 'out', 'Eso, cuídate.', 9),
      ] },
      { id: 'respondido', mensajes_wa: [
        mensaje('r2', 'out', 'Sí, hacemos páginas web', 12),
        mensaje('r1', 'in', '¿Hacen páginas web?', 10),
      ] },
      { id: 'sin-hilo', mensajes_wa: [] },
    ]
    const sb = createClient<Database>('https://example.test', 'clave-de-prueba', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (url) => {
        pedidos.push(new URL(String(url)))
        return new Response(JSON.stringify(filas), { headers: { 'Content-Type': 'application/json' } })
      } },
    })
    const resultado = await new LeadsRepository(sb).list()
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].searchParams.get('mensajes_wa.limit')).toBe('30')
    expect(pedidos[0].searchParams.get('mensajes_wa.order')).toBe('created_at.desc,id.desc')
    expect(pedidos[0].searchParams.get('eliminado_at')).toBe('is.null')
    expect(resultado.map(l => [l.id, l.porResponderDesde])).toEqual([
      ['kairos', null], ['epoca', null], ['pregunta', '2026-09-23T10:00:00Z'],
      ['respondido', null], ['sin-hilo', null],
    ])
    expect(resultado.every(l => !('mensajes_wa' in l))).toBe(true)
  })

  it('treinta mensajes del cliente sin ninguno nuestro: espera respuesta, y la lista no se cae', async () => {
    // Antes esto lanzaba un error y tumbaba Leads entero para todo el equipo.
    // Un cliente que escribió treinta veces sin respuesta es, justamente, el
    // que más espera.
    const sb = createClient<Database>('https://example.test', 'clave-de-prueba', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => new Response(JSON.stringify([
        { id: 'largo', mensajes_wa: Array.from({ length: 30 }, (_, i) => mensaje(String(i), 'in', '¿me pueden llamar?', 23 - (i % 20))) },
      ]), { headers: { 'Content-Type': 'application/json' } }) },
    })
    const [lead] = await new LeadsRepository(sb).list()
    expect(lead.porResponderDesde).not.toBeNull()
  })

  it('treinta cierres seguidos no son un pendiente', async () => {
    const sb = createClient<Database>('https://example.test', 'clave-de-prueba', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async () => new Response(JSON.stringify([
        { id: 'bot', mensajes_wa: Array.from({ length: 30 }, (_, i) => mensaje(String(i), 'in', '👋', 12)) },
      ]), { headers: { 'Content-Type': 'application/json' } }) },
    })
    const [lead] = await new LeadsRepository(sb).list()
    expect(lead.porResponderDesde).toBeNull()
  })
})
