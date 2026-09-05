import { describe, it, expect } from 'vitest'
import { esDuplicadoSaliente, VENTANA_DUPLICADO_MS } from './duplicado'

const AHORA = new Date('2026-09-04T22:09:00.000Z')
const haceSegundos = (s: number) => new Date(AHORA.getTime() - s * 1000).toISOString()

describe('esDuplicadoSaliente', () => {
  it('caza el eco del agente: mismo texto saliente, segundos antes', () => {
    // El caso real: "Eso, cuídate." apareció dos veces en el hilo del CRM y una
    // sola en WhatsApp.
    const recientes = [{ texto: 'Eso, cuídate.', direccion: 'out', created_at: haceSegundos(3) }]
    expect(esDuplicadoSaliente({ texto: 'Eso, cuídate.' }, recientes, AHORA)).toBe(true)
  })

  it('ignora los espacios de sobra', () => {
    const recientes = [{ texto: 'De nada. Que vaya bien 🙏 ', direccion: 'out', created_at: haceSegundos(1) }]
    expect(esDuplicadoSaliente({ texto: ' De nada. Que vaya bien 🙏' }, recientes, AHORA)).toBe(true)
  })

  it('NO toca los entrantes: el lead puede repetirse y eso son dos mensajes', () => {
    const recientes = [{ texto: 'Gracias', direccion: 'in', created_at: haceSegundos(2) }]
    expect(esDuplicadoSaliente({ texto: 'Gracias' }, recientes, AHORA)).toBe(false)
  })

  it('pasado el minuto ya no es eco, es alguien escribiendo de nuevo', () => {
    const viejo = new Date(AHORA.getTime() - VENTANA_DUPLICADO_MS - 1000).toISOString()
    const recientes = [{ texto: 'Hola', direccion: 'out', created_at: viejo }]
    expect(esDuplicadoSaliente({ texto: 'Hola' }, recientes, AHORA)).toBe(false)
  })

  it('texto distinto no es duplicado', () => {
    const recientes = [{ texto: 'Gracias', direccion: 'out', created_at: haceSegundos(1) }]
    expect(esDuplicadoSaliente({ texto: 'Eso, cuídate.' }, recientes, AHORA)).toBe(false)
  })

  it('hilo vacío: nunca es duplicado', () => {
    expect(esDuplicadoSaliente({ texto: 'Hola' }, [], AHORA)).toBe(false)
  })

  it('ante una fecha ilegible, guarda el mensaje', () => {
    const recientes = [{ texto: 'Hola', direccion: 'out', created_at: 'no-es-fecha' }]
    expect(esDuplicadoSaliente({ texto: 'Hola' }, recientes, AHORA)).toBe(false)
  })

  it('una fecha del futuro no cuenta como eco anterior', () => {
    const futuro = new Date(AHORA.getTime() + 5000).toISOString()
    const recientes = [{ texto: 'Hola', direccion: 'out', created_at: futuro }]
    expect(esDuplicadoSaliente({ texto: 'Hola' }, recientes, AHORA)).toBe(false)
  })
})
