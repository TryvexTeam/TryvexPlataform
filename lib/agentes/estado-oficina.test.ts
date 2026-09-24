import { describe, it, expect } from 'vitest'
import { estadoEnOficina, type EntradaOficina } from './estado-oficina'

const ahora = Date.parse('2026-09-23T21:00:00Z')
const hace = (min: number) => new Date(ahora - min * 60_000).toISOString()
const en = (min: number) => new Date(ahora + min * 60_000).toISOString()
const base: EntradaOficina = {
  activo: true, ultimoUsoAt: hace(1), declarado: null, declaradoHasta: null, nota: null,
  encargoEnCurso: null, esperandoPermiso: false, ahora,
}

describe('estadoEnOficina', () => {
  it('un encargo en curso manda sobre lo declarado', () => {
    const r = estadoEnOficina({ ...base, declarado: 'descansando', declaradoHasta: en(10), encargoEnCurso: 'Revisar el proxy' })
    expect(r).toEqual({ estado: 'trabajando', nota: 'Revisar el proxy', fuente: 'encargo', venceAt: null })
  })

  it('lo que espera permiso se muestra aunque esté descansando', () => {
    const r = estadoEnOficina({ ...base, declarado: 'descansando', declaradoHasta: en(10), esperandoPermiso: true })
    expect(r.estado).toBe('esperando_permiso')
  })

  it('lo declarado vale mientras no venza', () => {
    const r = estadoEnOficina({ ...base, declarado: 'trabajando', declaradoHasta: en(5), nota: 'afinando el guion' })
    expect(r).toEqual({ estado: 'trabajando', nota: 'afinando el guion', fuente: 'declarado', venceAt: en(5) })
  })

  it('lo declarado vencido no cuenta: un agente caído no queda trabajando para siempre', () => {
    const r = estadoEnOficina({ ...base, ultimoUsoAt: hace(90), declarado: 'trabajando', declaradoHasta: hace(1) })
    expect(r.estado).toBe('ausente')
  })

  it('el latido solo nunca dice trabajando: consultar la cola no es trabajar', () => {
    expect(estadoEnOficina({ ...base, ultimoUsoAt: hace(0) }).estado).toBe('descansando')
  })

  it('sin señales por más de 30 minutos, no está', () => {
    expect(estadoEnOficina({ ...base, ultimoUsoAt: hace(31) }).estado).toBe('ausente')
    expect(estadoEnOficina({ ...base, ultimoUsoAt: null }).estado).toBe('ausente')
  })

  it('un agente desactivado no está, aunque tenga encargos', () => {
    const r = estadoEnOficina({ ...base, activo: false, encargoEnCurso: 'x' })
    expect(r).toEqual({ estado: 'ausente', nota: 'Desactivado', fuente: 'desactivado', venceAt: null })
  })

  it('puede declararse ausente aunque tenga latido reciente', () => {
    expect(estadoEnOficina({ ...base, declarado: 'ausente', declaradoHasta: en(60) }).estado).toBe('ausente')
  })
})
