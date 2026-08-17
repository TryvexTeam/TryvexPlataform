import { describe, it, expect } from 'vitest'
import { crearFila } from './fila.js'

/** Espera a que se vacien las microtareas pendientes. */
const respirar = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('crearFila', () => {
  it('el caso que rompio en produccion: dos mensajes juntos crean UNA sola ficha', async () => {
    // Reproduce el handler de entrantes: mirar si existe ficha y, si no,
    // crearla. Sin fila, los dos mensajes miraban antes de que el otro
    // escribiera y ambos creaban.
    const enFilaPara = crearFila()
    const fichas = []

    const atender = async () => {
      const existe = fichas.length > 0
      await respirar() // el hueco donde antes se colaba el segundo mensaje
      if (!existe) fichas.push('ficha')
    }

    await Promise.all([
      enFilaPara('56911111111', atender),
      enFilaPara('56911111111', atender),
    ])

    expect(fichas).toHaveLength(1)
  })

  it('respeta el orden de llegada dentro de un mismo numero', async () => {
    const enFilaPara = crearFila()
    const orden = []

    await Promise.all([
      enFilaPara('56911111111', async () => {
        await new Promise((r) => setTimeout(r, 10)) // el primero es el lento
        orden.push('primero')
      }),
      enFilaPara('56911111111', async () => {
        orden.push('segundo')
      }),
    ])

    expect(orden).toEqual(['primero', 'segundo'])
  })

  it('numeros distintos no se esperan entre si', async () => {
    const enFilaPara = crearFila()
    const orden = []

    await Promise.all([
      enFilaPara('56911111111', async () => {
        await new Promise((r) => setTimeout(r, 20))
        orden.push('lento')
      }),
      enFilaPara('56922222222', async () => {
        orden.push('rapido')
      }),
    ])

    // El rapido no queda atrapado detras del lento de otra conversacion.
    expect(orden).toEqual(['rapido', 'lento'])
  })

  it('un fallo no deja bloqueada la conversacion', async () => {
    const enFilaPara = crearFila()

    await expect(
      enFilaPara('56911111111', async () => {
        throw new Error('se cayo la base')
      }),
    ).rejects.toThrow('se cayo la base')

    // El siguiente mensaje de esa misma persona igual se atiende.
    await expect(enFilaPara('56911111111', async () => 'atendido')).resolves.toBe('atendido')
  })

  it('el error de la tarea llega a quien la encolo, no se lo traga la fila', async () => {
    const enFilaPara = crearFila()
    await expect(
      enFilaPara('56911111111', async () => {
        throw new Error('error visible')
      }),
    ).rejects.toThrow('error visible')
  })

  it('la fila se vacia sola y no acumula numeros para siempre', async () => {
    const enFilaPara = crearFila()

    await enFilaPara('56911111111', async () => {})
    await enFilaPara('56922222222', async () => {})
    await respirar()

    expect(enFilaPara.pendientes()).toBe(0)
  })
})
