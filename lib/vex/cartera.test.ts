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

/**
 * El bug que cierra esto: pedirle a Vex tres mensajes y después tres más
 * devolvía los mismos tres negocios. El orden es determinista (score
 * descendente) y no había nada que marcara lo ya ofrecido — un borrador solo
 * llega a `outreach_messages` cuando se ENVÍA, así que uno descartado no dejaba
 * rastro. Había que repetirle el contexto entero para que pasara al siguiente.
 */
describe('recomendarLeads no repite a quien ya se propuso', () => {
  const cartera = [
    { id: 'a', nombre_negocio: 'Barbería A', nicho: 'barberías', localidad: 'Maipú', score: 90, telefono: '987654321', redes_sociales: null },
    { id: 'b', nombre_negocio: 'Barbería B', nicho: 'barberías', localidad: 'Maipú', score: 80, telefono: '987654322', redes_sociales: null },
    { id: 'c', nombre_negocio: 'Barbería C', nicho: 'barberías', localidad: 'Maipú', score: 70, telefono: '987654323', redes_sociales: null },
  ]

  it('sin excluir nada, dos pedidos seguidos dan lo mismo (el bug)', async () => {
    const primero = await recomendarLeads(sbMock(cartera), { cantidad: 2 })
    const segundo = await recomendarLeads(sbMock(cartera), { cantidad: 2 })
    expect(segundo.map((l) => l.id)).toEqual(primero.map((l) => l.id))
  })

  it('excluyendo los ya propuestos, el segundo pedido sigue donde quedó', async () => {
    const primero = await recomendarLeads(sbMock(cartera), { cantidad: 2 })
    expect(primero.map((l) => l.id)).toEqual(['a', 'b'])

    const segundo = await recomendarLeads(sbMock(cartera), {
      cantidad: 2,
      excluir: primero.map((l) => l.id),
    })
    expect(segundo.map((l) => l.id)).toEqual(['c'])
  })

  it('devuelve vacío cuando ya se propusieron todos, en vez de repetir', async () => {
    const out = await recomendarLeads(sbMock(cartera), { excluir: ['a', 'b', 'c'] })
    expect(out).toEqual([])
  })

  it('una lista de exclusión vacía no cambia nada', async () => {
    const out = await recomendarLeads(sbMock(cartera), { cantidad: 3, excluir: [] })
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('ignora ids que no están en la cartera', async () => {
    const out = await recomendarLeads(sbMock(cartera), { cantidad: 3, excluir: ['zzz'] })
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('la exclusión se aplica DESPUÉS de los filtros, y el corte respeta la cantidad', async () => {
    // Sin esto, excluir al primero devolvería 2 de 3 en vez de completar el cupo.
    const out = await recomendarLeads(sbMock(cartera), { cantidad: 2, excluir: ['a'] })
    expect(out.map((l) => l.id)).toEqual(['b', 'c'])
  })
})
