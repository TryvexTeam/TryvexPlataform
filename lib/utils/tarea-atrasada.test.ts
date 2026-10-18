import { describe, expect, it } from 'vitest'

import { tareaAtrasada } from './tarea-atrasada'

/** Una fecha 'YYYY-MM-DD' a N días de hoy, en hora de Santiago. */
function diaRelativo(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const base = { estado: 'sin_empezar', eliminado_at: null }

describe('tareaAtrasada', () => {
  it('ayer está atrasada', () => {
    expect(tareaAtrasada({ ...base, fecha_limite: diaRelativo(-1) })).toBe(true)
  })

  it('HOY todavía no está atrasada', () => {
    // Lo que vence hoy no es deuda a las 9 de la mañana. Si esto se compara por
    // instante en vez de por día, media cartera aparece en rojo cada mañana y
    // el rojo deja de significar algo.
    expect(tareaAtrasada({ ...base, fecha_limite: diaRelativo(0) })).toBe(false)
  })

  it('mañana no está atrasada', () => {
    expect(tareaAtrasada({ ...base, fecha_limite: diaRelativo(1) })).toBe(false)
  })

  it('sin fecha nunca está atrasada', () => {
    expect(tareaAtrasada({ ...base, fecha_limite: null })).toBe(false)
  })

  it('una tarea terminada no está atrasada, aunque venciera hace meses', () => {
    expect(tareaAtrasada({ ...base, estado: 'listo', fecha_limite: diaRelativo(-90) })).toBe(false)
  })

  it('una tarea en la papelera no reclama nada', () => {
    expect(
      tareaAtrasada({
        estado: 'sin_empezar',
        fecha_limite: diaRelativo(-30),
        eliminado_at: '2026-09-01T00:00:00Z',
      }),
    ).toBe(false)
  })

  it('en revisión y vencida SÍ cuenta: sigue sin cerrarse', () => {
    expect(tareaAtrasada({ ...base, estado: 'en_revision', fecha_limite: diaRelativo(-2) })).toBe(true)
  })
})
