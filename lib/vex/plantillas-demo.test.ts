import { describe, it, expect } from 'vitest'
import { PLANTILLAS_DEMO, guionDePlantilla, plantillaPorId } from './plantillas-demo'
import { perfilDeRubro, rubroDelGuion } from './simulacion-demo'

describe('plantillas de demo', () => {
  it('los ids no se repiten', () => {
    const ids = PLANTILLAS_DEMO.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cada guion cumple el largo que exige la base (50 a 8000)', () => {
    for (const p of PLANTILLAS_DEMO) {
      const g = guionDePlantilla(p)
      expect(g.length, p.id).toBeGreaterThanOrEqual(50)
      expect(g.length, p.id).toBeLessThanOrEqual(8000)
    }
  })

  it('cada guion lleva su rubro, y la vista previa lo reconoce', () => {
    for (const p of PLANTILLAS_DEMO) {
      expect(rubroDelGuion(guionDePlantilla(p)), p.id).toBe(p.rubro)
    }
    // Solo la farmacia cae en la consulta genérica: no se le simula un pedido.
    const sinFlujo = PLANTILLAS_DEMO.filter((p) => perfilDeRubro(p.rubro).tipo === 'consulta').map((p) => p.id)
    expect(sinFlujo).toEqual(['farmacia'])
  })

  it('lleva los servicios, sin precios, y hereda las reglas del guion', () => {
    const g = guionDePlantilla(plantillaPorId('barberia')!)
    expect(g).toMatch(/Lo que ofrece \(sin precios/)
    expect(g).toContain('perfilado de barba')
    expect(g).toMatch(/No das precios/)
    expect(PLANTILLAS_DEMO.flatMap((p) => p.servicios).join(' ')).not.toMatch(/\$|\d+\s?(mil|pesos)/i)
  })

  it('las reglas de cada rubro sensible siguen aplicando', () => {
    expect(guionDePlantilla(plantillaPorId('farmacia')!)).toMatch(/no recomiendas medicamentos/)
    expect(guionDePlantilla(plantillaPorId('dental')!)).toMatch(/no diagnosticas/)
    expect(guionDePlantilla(plantillaPorId('veterinaria')!)).toMatch(/no diagnosticas/)
  })

  it('no afirma horario ni dirección que no tiene', () => {
    const g = guionDePlantilla(plantillaPorId('restaurante')!)
    expect(g).toMatch(/Horario: no lo tienes/)
    expect(g).toMatch(/Dirección: no la tienes/)
  })

  it('usa el nombre que le da el equipo, o el de ejemplo si viene vacío', () => {
    const p = plantillaPorId('optica')!
    expect(guionDePlantilla(p, 'Óptica Kairos')).toContain('Óptica Kairos')
    expect(guionDePlantilla(p, '  ')).toContain(p.nombreEjemplo)
  })
})
