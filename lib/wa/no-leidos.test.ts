import { describe, it, expect } from 'vitest'
import { contarNoLeidos } from './no-leidos'

const LEAD = 'a1'
const OTRO = 'b2'

describe('contarNoLeidos', () => {
  it('nunca abierto: cuenta todos los entrantes', () => {
    const conteo = contarNoLeidos(
      [{ id: LEAD, wa_leido_hasta: null }],
      [
        { lead_id: LEAD, created_at: '2026-08-16T10:00:00Z' },
        { lead_id: LEAD, created_at: '2026-08-16T11:00:00Z' },
      ]
    )
    expect(conteo[LEAD]).toBe(2)
  })

  it('solo cuenta lo posterior a la ultima lectura', () => {
    const conteo = contarNoLeidos(
      [{ id: LEAD, wa_leido_hasta: '2026-08-16T10:30:00Z' }],
      [
        { lead_id: LEAD, created_at: '2026-08-16T10:00:00Z' }, // ya visto
        { lead_id: LEAD, created_at: '2026-08-16T11:00:00Z' }, // nuevo
      ]
    )
    expect(conteo[LEAD]).toBe(1)
  })

  it('el lead al dia no aparece en la respuesta', () => {
    const conteo = contarNoLeidos(
      [{ id: LEAD, wa_leido_hasta: '2026-08-16T23:00:00Z' }],
      [{ lead_id: LEAD, created_at: '2026-08-16T10:00:00Z' }]
    )
    expect(conteo).toEqual({})
  })

  it('el mensaje del mismo instante que la lectura cuenta como leido', () => {
    // Si contara como pendiente, abrir el chat dejaria un "1" imposible de sacar.
    const mismo = '2026-08-16T10:00:00Z'
    const conteo = contarNoLeidos(
      [{ id: LEAD, wa_leido_hasta: mismo }],
      [{ lead_id: LEAD, created_at: mismo }]
    )
    expect(conteo[LEAD]).toBeUndefined()
  })

  it('no mezcla leads', () => {
    const conteo = contarNoLeidos(
      [
        { id: LEAD, wa_leido_hasta: null },
        { id: OTRO, wa_leido_hasta: null },
      ],
      [
        { lead_id: LEAD, created_at: '2026-08-16T10:00:00Z' },
        { lead_id: OTRO, created_at: '2026-08-16T10:00:00Z' },
        { lead_id: OTRO, created_at: '2026-08-16T10:05:00Z' },
      ]
    )
    expect(conteo).toEqual({ [LEAD]: 1, [OTRO]: 2 })
  })

  it('ignora mensajes de leads que ya no existen', () => {
    const conteo = contarNoLeidos(
      [{ id: LEAD, wa_leido_hasta: null }],
      [{ lead_id: 'borrado', created_at: '2026-08-16T10:00:00Z' }]
    )
    expect(conteo).toEqual({})
  })

  it('ignora entrantes sin lead o con fecha ilegible', () => {
    const conteo = contarNoLeidos(
      [{ id: LEAD, wa_leido_hasta: null }],
      [
        { lead_id: null, created_at: '2026-08-16T10:00:00Z' },
        { lead_id: LEAD, created_at: 'cualquier cosa' },
      ]
    )
    expect(conteo).toEqual({})
  })

  it('sin mensajes no devuelve nada', () => {
    expect(contarNoLeidos([{ id: LEAD, wa_leido_hasta: null }], [])).toEqual({})
  })
})
