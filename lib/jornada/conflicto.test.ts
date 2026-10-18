import { describe, expect, it } from 'vitest'

import { explicarConflicto } from './conflicto'

const abierta = { entrada_at: '2026-09-25T18:25:23Z', salida_at: null, pausas: [] }

describe('explicarConflicto — la pantalla estaba desfasada con la base', () => {
  it('marcó entrada con la jornada ya abierta (otra pestaña, el celular)', () => {
    expect(explicarConflicto('entrada', abierta)).toMatch(/ya tenías la jornada abierta/i)
  })

  it('marcó salida o pausa y la jornada ya se había cerrado sola', () => {
    for (const accion of ['salida', 'pausa', 'reanudar'] as const) {
      expect(explicarConflicto(accion, null)).toMatch(/ya estaba cerrada/i)
    }
  })

  it('pausa o reanudar sobre un estado de pausa que ya cambió', () => {
    expect(explicarConflicto('pausa', abierta)).toMatch(/al día/i)
    expect(explicarConflicto('reanudar', abierta)).toMatch(/al día/i)
  })
})
