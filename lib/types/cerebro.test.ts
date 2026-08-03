import { describe, expect, test } from 'vitest'
import { agruparPorDia, type EntradaCerebro } from './cerebro'

function entrada(id: string, ocurrio_at: string): EntradaCerebro {
  return {
    id,
    entidad_tipo: 'cliente',
    entidad_id: 'c1',
    entidad_nombre: 'Perrustingo',
    fuente: 'whatsapp',
    titulo: 'WhatsApp recibido',
    contenido: null,
    autor_id: null,
    autor_nombre: null,
    ocurrio_at,
    metadata: {},
  }
}

describe('agruparPorDia', () => {
  test('junta en un mismo día los hechos de esa jornada', () => {
    const grupos = agruparPorDia([
      entrada('a', '2026-08-03T14:00:00Z'),
      entrada('b', '2026-08-03T18:30:00Z'),
    ])

    expect(grupos).toHaveLength(1)
    expect(grupos[0].entradas.map((e) => e.id)).toEqual(['a', 'b'])
  })

  test('usa el día de Santiago, no el de UTC', () => {
    // 03:00 UTC del 4 son las 23:00 del 3 en Santiago: mismo día laboral.
    const grupos = agruparPorDia([
      entrada('noche', '2026-08-04T03:00:00Z'),
      entrada('tarde', '2026-08-03T20:00:00Z'),
    ])

    expect(grupos).toHaveLength(1)
    expect(grupos[0].dia).toBe('2026-08-03')
  })

  test('ordena los días del más reciente al más antiguo', () => {
    const grupos = agruparPorDia([
      entrada('viejo', '2026-07-30T14:00:00Z'),
      entrada('nuevo', '2026-08-03T14:00:00Z'),
    ])

    expect(grupos.map((g) => g.dia)).toEqual(['2026-08-03', '2026-07-30'])
  })

  test('sin entradas devuelve una lista vacía', () => {
    expect(agruparPorDia([])).toEqual([])
  })
})
