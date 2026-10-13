import { describe, expect, it } from 'vitest'
import { agruparRachas } from './rachas'
import { estadoTicks } from './ticks'
import { etiquetaFecha } from './fechas'
import { cantidadEmoji, esSoloEmoji } from './emoji'
import { puedeEditarMensaje } from './edicion'
import { indicePrimerNoLeido } from './no-leidos'
import { leerJSON } from './subir-adjuntos'
import { EditarMensajeSchema, EnviarMensajeSchema, type Mensaje, type MiembroChat } from '@/lib/types/chat'

const mensaje = (id: string, autor: string, fecha: string): Mensaje => ({
  id,
  conversacion_id: 'c',
  autor_id: autor,
  contenido: 'hola',
  created_at: fecha,
  editado_at: null,
  eliminado_at: null,
})

const miembro = (id: string, leido: string): MiembroChat => ({
  integrante_id: id,
  nombre: id,
  avatar_url: null,
  color: null,
  ultimo_leido_at: leido,
})

describe('helpers del chat', () => {
  it('agrupa solo al mismo autor dentro de cinco minutos', () => {
    const base = '2026-10-13T12:00:00Z'
    const grupos = agruparRachas([
      mensaje('1', 'a', base),
      mensaje('2', 'a', '2026-10-13T12:05:00Z'),
      mensaje('3', 'a', '2026-10-13T12:10:01Z'),
      mensaje('4', 'b', '2026-10-13T12:11:00Z'),
    ])
    expect(grupos.map((g) => g.iniciaRacha)).toEqual([true, false, true, true])
  })

  it('calcula enviado, entregado y leído según las marcas del resto', () => {
    const m = mensaje('1', 'yo', '2026-10-13T12:00:00Z')
    expect(estadoTicks(m, [miembro('yo', m.created_at), miembro('a', '2026-10-13T11:00:00Z')], 'yo')).toBe('enviado')
    expect(estadoTicks(m, [miembro('yo', m.created_at), miembro('a', m.created_at), miembro('b', '2026-10-13T11:00:00Z')], 'yo')).toBe('entregado')
    expect(estadoTicks(m, [miembro('yo', m.created_at), miembro('a', m.created_at)], 'yo')).toBe('leido')
  })

  it('etiqueta fechas en la zona de Santiago', () => {
    const ahora = new Date('2026-10-13T15:00:00Z')
    expect(etiquetaFecha('2026-10-13T03:30:00Z', ahora)).toBe('Hoy')
    expect(etiquetaFecha('2026-10-12T16:00:00Z', ahora)).toBe('Ayer')
  })

  it('reconoce de uno a tres emoji completos', () => {
    expect(cantidadEmoji('👨‍👩‍👧‍👦 ❤️')).toBe(2)
    expect(esSoloEmoji('👍🏽❤️😂')).toBe(true)
    expect(esSoloEmoji('👍 hola')).toBe(false)
    expect(esSoloEmoji('😀😀😀😀')).toBe(false)
  })

  it('limita la edición a quince minutos y mensajes vigentes', () => {
    const creado = '2026-10-13T12:00:00Z'
    expect(puedeEditarMensaje(creado, null, Date.parse('2026-10-13T12:15:00Z'))).toBe(true)
    expect(puedeEditarMensaje(creado, null, Date.parse('2026-10-13T12:15:01Z'))).toBe(false)
    expect(puedeEditarMensaje(creado, creado, Date.parse('2026-10-13T12:01:00Z'))).toBe(false)
  })

  it('ubica el primer mensaje ajeno posterior a la lectura', () => {
    const lista = [
      mensaje('1', 'otro', '2026-10-13T11:59:00Z'),
      mensaje('2', 'yo', '2026-10-13T12:01:00Z'),
      mensaje('3', 'otro', '2026-10-13T12:02:00Z'),
    ]
    expect(indicePrimerNoLeido(lista, '2026-10-13T12:00:00Z', 'yo')).toBe(2)
  })

  it('no limita caracteres y explica el único tope real de 4,5 MB', async () => {
    const contenido = 'a'.repeat(25_000)
    expect(EnviarMensajeSchema.safeParse({
      conversacion_id: '123e4567-e89b-12d3-a456-426614174000',
      contenido,
    }).success).toBe(true)
    expect(EditarMensajeSchema.safeParse({ contenido }).success).toBe(true)
    const error = await leerJSON(new Response('Payload Too Large', { status: 413 }))
    expect(error?.error).toContain('4,5 MB')
  })
})
