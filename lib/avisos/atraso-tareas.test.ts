import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  diasVencida,
  enviarAvisosDeAtraso,
  envioWhatsappEncendido,
  textoDelAviso,
  type DestinatarioAviso,
} from './atraso-tareas'

vi.mock('@/lib/wa/transporte', () => ({
  enviarPorVex: vi.fn(async () => ({ ok: true, referencia: 'x1' })),
}))

const HOY = new Date(2026, 8, 11) // 11-sep-2026

function persona(extra: Partial<DestinatarioAviso> = {}): DestinatarioAviso {
  return {
    integrante_id: 'i1',
    nombre: 'Fabian Rodriguez',
    telefono: '+56911111111',
    tareas: [{ id: 't1', titulo: 'Investigar Linktr.ee', fecha_limite: '2026-09-04' }],
    ...extra,
  }
}

afterEach(() => {
  delete process.env.AVISOS_WA
  vi.clearAllMocks()
})

describe('diasVencida', () => {
  it('cuenta los días desde la fecha límite', () => {
    expect(diasVencida('2026-09-04', HOY)).toBe(7)
  })

  it('lo que vence hoy no lleva días de atraso', () => {
    expect(diasVencida('2026-09-11', HOY)).toBe(0)
  })

  it('el día 1 del mes no se corre por zona horaria', () => {
    // Con `new Date('2026-09-01')` la fecha se lee como UTC y en Chile cae el
    // 31 de agosto: el aviso diría un día más de atraso del real.
    expect(diasVencida('2026-09-01', HOY)).toBe(10)
  })
})

describe('textoDelAviso', () => {
  it('habla por el nombre de pila, no el nombre completo', () => {
    expect(textoDelAviso(persona(), HOY)).toMatch(/^Fabian,/)
  })

  it('con una sola tarea usa el singular', () => {
    expect(textoDelAviso(persona(), HOY)).toContain('tienes una tarea pasada de fecha')
  })

  it('nombra hasta TRES tareas y resume el resto', () => {
    // Una lista de nueve no se lee: se cierra.
    const tareas = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      titulo: `Tarea ${i}`,
      fecha_limite: '2026-09-04',
    }))
    const texto = textoDelAviso(persona({ tareas }), HOY)
    expect(texto).toContain('tienes 5 tareas pasadas de fecha')
    expect(texto).toContain('• Tarea 0')
    expect(texto).toContain('• Tarea 2')
    expect(texto).not.toContain('• Tarea 3')
    expect(texto).toContain('• y 2 más')
  })

  it('lo más vencido va primero', () => {
    const texto = textoDelAviso(
      persona({
        tareas: [
          { id: 'a', titulo: 'Nueva', fecha_limite: '2026-09-10' },
          { id: 'b', titulo: 'Vieja', fecha_limite: '2026-07-17' },
        ],
      }),
      HOY,
    )
    expect(texto.indexOf('Vieja')).toBeLessThan(texto.indexOf('Nueva'))
  })

  it('dice cuánto lleva vencida cada una', () => {
    expect(textoDelAviso(persona(), HOY)).toContain('(7 días)')
  })

  it('no usa la palabra "IA" ni saludos de folleto', () => {
    // En Chile "IA" juega en contra y un "Hola! Te recordamos que..." se lee
    // como spam de empresa y se ignora.
    const texto = textoDelAviso(persona(), HOY)
    expect(texto).not.toMatch(/\bIA\b/)
    expect(texto).not.toMatch(/te recordamos/i)
  })
})

describe('enviarAvisosDeAtraso', () => {
  it('por defecto NO manda nada: solo simula', async () => {
    expect(envioWhatsappEncendido()).toBe(false)
    const [r] = await enviarAvisosDeAtraso([persona()], HOY)
    expect(r.estado).toBe('simulado')
    expect(r.texto).toContain('Fabian,')
  })

  it('con AVISOS_WA=on sí manda', async () => {
    process.env.AVISOS_WA = 'on'
    const [r] = await enviarAvisosDeAtraso([persona()], HOY)
    expect(r.estado).toBe('enviado')
  })

  it('sin teléfono lo REPORTA, no lo salta en silencio', async () => {
    // Le pasa a 2 de los 5 integrantes hoy, y son dos de los que más atraso
    // acumulan: si esto se saltara callado, parecería que el aviso funcionó.
    process.env.AVISOS_WA = 'on'
    const [r] = await enviarAvisosDeAtraso([persona({ telefono: null })], HOY)
    expect(r.estado).toBe('sin-telefono')
  })

  it('a quien no debe nada no se le escribe', async () => {
    const salida = await enviarAvisosDeAtraso([persona({ tareas: [] })], HOY)
    expect(salida).toHaveLength(0)
  })

  it('un envío que falla no tumba a los demás', async () => {
    process.env.AVISOS_WA = 'on'
    const { enviarPorVex } = await import('@/lib/wa/transporte')
    vi.mocked(enviarPorVex).mockResolvedValueOnce({ ok: false, error: 'agente caído' })
    const salida = await enviarAvisosDeAtraso(
      [persona({ integrante_id: 'i1' }), persona({ integrante_id: 'i2', nombre: 'Vicente Garcia' })],
      HOY,
    )
    expect(salida[0].estado).toBe('error')
    expect(salida[0].detalle).toBe('agente caído')
    expect(salida[1].estado).toBe('enviado')
  })
})
