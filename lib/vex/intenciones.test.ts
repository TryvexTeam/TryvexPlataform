import { describe, it, expect } from 'vitest'
import { clasificarIntencion } from './intenciones'

describe('clasificarIntencion', () => {
  it('parsea acciones múltiples y aplica el tope de 5', async () => {
    const llm = async () => JSON.stringify({ acciones: Array(8).fill({ tipo: 'reporte' }) })
    const acc = await clasificarIntencion('dame todo', [], llm)
    expect(acc).toHaveLength(5)
  })

  it('cae a conversar si el JSON no trae acciones válidas', async () => {
    const acc = await clasificarIntencion('hola', [], async () => '{"acciones":[{"tipo":"bailar"}]}')
    expect(acc).toEqual([{ tipo: 'conversar' }])
  })
})
