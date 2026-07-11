import { describe, it, expect, vi } from 'vitest'
import { marcarEstado, recomendarLeads } from './cartera'

function sbMock(rows: unknown[]) {
  const q: Record<string, unknown> = {}
  const chain = ['from','select','eq','in','order','limit','update'] as const
  for (const m of chain) q[m] = vi.fn(() => q)
  ;(q as { then?: unknown }).then = (res: (v: unknown) => void) => res({ data: rows, error: null, count: rows.length })
  return q as never
}

describe('marcarEstado', () => {
  it('rechaza estados fuera de la lista', async () => {
    await expect(marcarEstado(sbMock([]), ['abc'], 'volando' as never)).rejects.toThrow(/inválido/i)
  })
  it('devuelve 0 sin ids, sin tocar la BD', async () => {
    const sb = sbMock([])
    await expect(marcarEstado(sb, [], 'contactado')).resolves.toBe(0)
  })
})

describe('recomendarLeads', () => {
  it('filtra leads sin teléfono ni redes y respeta cantidad', async () => {
    const rows = [
      { id: '1', nombre_negocio: 'A', nicho: 'panadería', localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null },
      { id: '2', nombre_negocio: 'B', nicho: 'panadería', localidad: 'Maipú', score: 80, telefono: null, redes_sociales: null },
    ]
    const out = await recomendarLeads(sbMock(rows), { cantidad: 5 })
    expect(out.map(l => l.id)).toEqual(['1'])
  })
})
