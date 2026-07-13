import { describe, it, expect, vi } from 'vitest'
import { conReintento } from './llm'

describe('conReintento', () => {
  it('reintenta ante 429 y devuelve el éxito', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce('ok')
    await expect(conReintento(fn, 3, async () => {})).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
  it('NO reintenta errores no transitorios', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 invalid api key'))
    await expect(conReintento(fn, 3, async () => {})).rejects.toThrow('401')
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('agota los intentos y tira el último error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('503 unavailable'))
    await expect(conReintento(fn, 2, async () => {})).rejects.toThrow('503')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
