import { describe, expect, it, vi } from 'vitest'
import type { DiaActividad } from '@/lib/types/perfil-integrante'

vi.mock('server-only', () => ({}))

const { calcularRacha, diaChile, diasDelCalendario } = await import('./perfil-integrante')

const dia = (fecha: string, total: number): DiaActividad => ({ fecha, total, leads: total, tareas: 0, mensajes: 0, horas: 0 })

describe('diaChile', () => {
  it('usa la fecha de Chile, no la de UTC', () => {
    // 02:00 UTC del 18 todavía es la noche del 17 en Santiago (UTC-3).
    expect(diaChile('2026-10-18T02:00:00Z')).toBe('2026-10-17')
    expect(diaChile('2026-10-18T04:00:00Z')).toBe('2026-10-18')
  })
})

describe('diasDelCalendario', () => {
  it('trae 53 semanas que terminan hoy (hora de Chile), sin días repetidos', () => {
    const dias = diasDelCalendario(new Date('2026-10-18T02:00:00Z'))
    expect(dias).toHaveLength(371)
    expect(dias.at(-1)).toBe('2026-10-17')
    expect(new Set(dias).size).toBe(dias.length)
  })
})

describe('calcularRacha', () => {
  it('cuenta los días seguidos hasta hoy', () => {
    expect(calcularRacha([dia('2026-10-15', 0), dia('2026-10-16', 2), dia('2026-10-17', 1), dia('2026-10-18', 3)])).toBe(3)
  })

  it('si hoy aún no hay nada, la racha sigue contando desde ayer', () => {
    expect(calcularRacha([dia('2026-10-16', 1), dia('2026-10-17', 4), dia('2026-10-18', 0)])).toBe(2)
  })

  it('sin actividad ayer ni hoy, la racha es 0', () => {
    expect(calcularRacha([dia('2026-10-16', 5), dia('2026-10-17', 0), dia('2026-10-18', 0)])).toBe(0)
  })
})
