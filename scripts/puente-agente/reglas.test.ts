import { describe, it, expect } from 'vitest'
import {
  MAX_RESPUESTA, armarPrompt, armarRespuesta, decidir, respuestaRendida, siguienteEspera,
} from './reglas.mjs'

const encargo = { id: 'e1', estado: 'aprobado', tipo: 'tarea', prioridad: 'media', titulo: 'Revisar el proxy', detalle: 'Ver por qué se cayó' }

describe('decidir', () => {
  it('lo aprobado se toma', () => {
    expect(decidir(encargo, undefined)).toBe('tomar')
  })
  it('en curso y recordado por esta máquina: se retoma', () => {
    expect(decidir({ ...encargo, estado: 'en_curso' }, { intentos: 1 })).toBe('reintentar')
  })
  it('en curso sin registro local: lo tiene otra máquina, no se toca', () => {
    expect(decidir({ ...encargo, estado: 'en_curso' }, undefined)).toBe('ajeno')
  })
  it('agotados los intentos: se rinde', () => {
    expect(decidir({ ...encargo, estado: 'en_curso' }, { intentos: 2 })).toBe('rendirse')
  })
})

describe('armarPrompt', () => {
  it('lleva el encargo, la identidad y cómo llegar al manual', () => {
    const p = armarPrompt(encargo, { agente: 'Spike', crm: 'https://crm.test' })
    expect(p).toContain('Eres Spike')
    expect(p).toContain('Revisar el proxy')
    expect(p).toContain('Ver por qué se cayó')
    expect(p).toContain('https://crm.test/api/agentes/manual')
  })
  it('nunca incluye el token', () => {
    expect(armarPrompt(encargo, { agente: 'Spike', crm: 'x' })).not.toMatch(/txa_/)
  })
})

describe('armarRespuesta', () => {
  const base = { codigo: 0, salida: '', error: '', vencido: false, minutos: 30 }
  it('éxito: lo que escribió el modelo', () => {
    expect(armarRespuesta({ ...base, salida: '  Hecho: revisé X.  ' })).toBe('Hecho: revisé X.')
  })
  it('éxito sin texto: lo dice, no inventa un listo', () => {
    expect(armarRespuesta(base)).toMatch(/sin escribir nada/)
  })
  it('fallo: código y motivo', () => {
    const r = armarRespuesta({ ...base, codigo: 1, error: 'OAuth session expired' })
    expect(r).toMatch(/código 1/)
    expect(r).toContain('OAuth session expired')
  })
  it('vencido: lo dice con lo último que alcanzó', () => {
    expect(armarRespuesta({ ...base, vencido: true, salida: 'a medias' })).toMatch(/no terminó en 30 min[\s\S]*a medias/)
  })
  it('respeta el largo que acepta el CRM', () => {
    expect(armarRespuesta({ ...base, salida: 'x'.repeat(20_000) }).length).toBeLessThanOrEqual(MAX_RESPUESTA + 40)
  })
  it('rendido: explica los intentos', () => {
    expect(respuestaRendida(2)).toMatch(/2 veces/)
  })
})

describe('siguienteEspera', () => {
  it('con cambios vuelve al mínimo', () => {
    expect(siguienteEspera(120_000, true)).toBe(15_000)
  })
  it('ociosa crece hasta el tope', () => {
    let t = 15_000
    for (let i = 0; i < 20; i++) t = siguienteEspera(t, false)
    expect(t).toBe(120_000)
  })
})
