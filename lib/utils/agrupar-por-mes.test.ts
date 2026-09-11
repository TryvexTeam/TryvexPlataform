import { describe, expect, it } from 'vitest'

import { agruparPorMes, SIN_FECHA } from './agrupar-por-mes'

const t = (fecha_limite: string | null, titulo = 'x') => ({ fecha_limite, titulo })

describe('agruparPorMes', () => {
  it('"Sin fecha" va arriba del todo', () => {
    const g = agruparPorMes([t('2026-09-11'), t(null), t('2026-08-19')])
    expect(g[0].id).toBe(SIN_FECHA)
    expect(g[0].titulo).toBe('Sin fecha')
  })

  it('los meses van del más viejo al más nuevo', () => {
    const g = agruparPorMes([t('2026-09-11'), t('2026-07-02'), t('2026-08-19')])
    expect(g.map((x) => x.id)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('un mes sin tareas no aparece', () => {
    // Julio y septiembre, nada en agosto: no hay grupo de agosto.
    const g = agruparPorMes([t('2026-07-02'), t('2026-09-11')])
    expect(g.map((x) => x.id)).toEqual(['2026-07', '2026-09'])
  })

  it('sin tareas no devuelve ningún grupo, ni siquiera "Sin fecha"', () => {
    expect(agruparPorMes([])).toEqual([])
  })

  it('si ninguna tiene fecha, hay un solo grupo', () => {
    const g = agruparPorMes([t(null), t(null)])
    expect(g).toHaveLength(1)
    expect(g[0].items).toHaveLength(2)
  })

  it('el título del mes va en español y con mayúscula', () => {
    const g = agruparPorMes([t('2026-09-11')])
    expect(g[0].titulo).toBe('Septiembre')
  })

  it('un año distinto al actual SÍ lleva el año escrito', () => {
    const otroAno = new Date().getFullYear() - 1
    const g = agruparPorMes([t(`${otroAno}-09-11`)])
    expect(g[0].titulo).toBe(`Septiembre ${otroAno}`)
  })

  it('el día 1 del mes NO se cae al mes anterior', () => {
    // Con `new Date('2026-09-01')` la fecha se lee como UTC y en Chile
    // (UTC-3/-4) cae el 31 de agosto: el grupo saldría mal.
    const g = agruparPorMes([t('2026-09-01')])
    expect(g[0].id).toBe('2026-09')
  })

  it('dentro del mes, lo que vence antes va primero', () => {
    const g = agruparPorMes([t('2026-09-28', 'fin'), t('2026-09-02', 'principio')])
    expect(g[0].items.map((x) => x.titulo)).toEqual(['principio', 'fin'])
  })

  it('no pierde ninguna tarea por el camino', () => {
    const entrada = [t('2026-09-11'), t(null), t('2026-08-19'), t('2026-08-01'), t(null)]
    const total = agruparPorMes(entrada).reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(entrada.length)
  })
})
