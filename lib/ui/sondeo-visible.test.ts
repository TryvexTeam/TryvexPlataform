import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { iniciarSondeoVisible, type FuenteVisibilidad } from './sondeo-visible'

/** Una pestaña de mentira que se puede tapar y destapar a mano. */
function pestanaFalsa(visibleAlInicio = true) {
  let visible = visibleAlInicio
  const oyentes = new Set<() => void>()
  const fuente: FuenteVisibilidad = {
    visible: () => visible,
    alCambiar(cb) {
      oyentes.add(cb)
      return () => oyentes.delete(cb)
    },
  }
  return {
    fuente,
    /** Cuántos siguen escuchando: sirve para probar que se limpia al cerrar. */
    get oyentes() { return oyentes.size },
    poner(v: boolean) {
      visible = v
      for (const cb of oyentes) cb()
    },
  }
}

describe('iniciarSondeoVisible', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('hace la primera pasada al tiro (diferida un tick) y después repite', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa()
    iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })

    // Nada en el mismo tick: se difiere a propósito para no escribir estado
    // dentro del cuerpo del efecto.
    expect(tarea).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(0)
    expect(tarea).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(15_000)
    expect(tarea).toHaveBeenCalledTimes(4)
  })

  it('no sondea si la pantalla nace tapada', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa(false)
    iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })

    vi.advanceTimersByTime(30_000)
    expect(tarea).toHaveBeenCalledTimes(0)
  })

  it('para cuando la pestaña se va y NO gasta viajes en segundo plano', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa()
    iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })
    vi.advanceTimersByTime(5_000) // primera + un ciclo
    expect(tarea).toHaveBeenCalledTimes(2)

    p.poner(false)
    vi.advanceTimersByTime(60_000)
    expect(tarea).toHaveBeenCalledTimes(2)
  })

  it('al volver pide de una, sin esperar el ciclo completo', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa()
    iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })
    vi.advanceTimersByTime(0)
    p.poner(false)
    vi.advanceTimersByTime(60_000)
    tarea.mockClear()

    p.poner(true)
    // Esto es lo que arregla el bug que se ve: volver al CRM y que el hilo
    // muestre lo que llegó mientras no se miraba.
    expect(tarea).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_000)
    expect(tarea).toHaveBeenCalledTimes(2)
  })

  it('no acumula intervalos si la visibilidad rebota', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa()
    iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })
    vi.advanceTimersByTime(0)
    // `focus` y `visibilitychange` pueden avisar los dos por el mismo gesto.
    p.poner(true)
    p.poner(true)
    tarea.mockClear()

    vi.advanceTimersByTime(5_000)
    expect(tarea).toHaveBeenCalledTimes(1)
  })

  it('al apagarlo no queda ni temporizador ni oyente', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa()
    const apagar = iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })
    vi.advanceTimersByTime(0)
    apagar()

    expect(p.oyentes).toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(tarea).toHaveBeenCalledTimes(1)
  })

  it('apagarlo antes del primer tick no dispara nada', () => {
    const tarea = vi.fn()
    const p = pestanaFalsa()
    const apagar = iniciarSondeoVisible({ cadaMs: 5000, tarea, visibilidad: p.fuente })
    apagar()

    vi.advanceTimersByTime(60_000)
    expect(tarea).toHaveBeenCalledTimes(0)
  })
})
