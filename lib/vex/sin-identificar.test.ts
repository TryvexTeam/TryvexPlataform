import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * La bandeja de entrantes y el desempate de teléfonos se pisaban.
 *
 * `buscarDestinatario` devuelve `null` tanto para "nadie tiene ese número"
 * como para "lo tienen dos". Esta vista usaba esa función, así que un empate
 * se mostraba igual que gente nueva — y el botón "Crear lead" habría creado
 * una TERCERA ficha con el mismo número, empeorando justo lo que el desempate
 * vino a arreglar.
 *
 * Ahora usa `resolverDestinatario`, que sí distingue.
 */

const h = vi.hoisted(() => ({
  obtenerConversaciones: vi.fn(),
  obtenerMensajes: vi.fn(),
  resolverDestinatario: vi.fn(),
}))

vi.mock('./agente', () => ({
  obtenerConversaciones: h.obtenerConversaciones,
  obtenerMensajes: h.obtenerMensajes,
}))
vi.mock('@/lib/agentes/destinatario', () => ({
  resolverDestinatario: h.resolverDestinatario,
}))

const CONVERSACIONES = [
  { id: 1, phone: '56911111111', name: 'Nuevo', last_message_at: 1_800_000_000, jid: null },
  { id: 2, phone: '56922222222', name: 'Empatado', last_message_at: 1_800_000_100, jid: null },
  { id: 3, phone: '56933333333', name: 'Con ficha', last_message_at: 1_800_000_200, jid: null },
]

const DOS_FICHAS = [
  { tipo: 'lead' as const, id: 'a', nombre: 'Valera Barber Shop' },
  { tipo: 'lead' as const, id: 'b', nombre: 'O-king barber' },
]

beforeEach(() => {
  vi.clearAllMocks()
  h.obtenerConversaciones.mockResolvedValue(CONVERSACIONES)
  h.obtenerMensajes.mockResolvedValue([])
  h.resolverDestinatario.mockImplementation(async (_admin: unknown, tel: string) => {
    if (tel === '56922222222') return { estado: 'ambiguo', candidatos: DOS_FICHAS }
    if (tel === '56933333333')
      return { estado: 'encontrado', destinatario: { tipo: 'lead', id: 'c', nombre: 'Ya está' } }
    return { estado: 'desconocido' }
  })
})

describe('entrantesSinIdentificar', () => {
  it('marca el empate como ambiguo, no como gente nueva', async () => {
    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes: r } = await entrantesSinIdentificar({})

    const empate = r.find((e) => e.telefono === '56922222222')
    expect(empate?.motivo).toBe('ambiguo')
  })

  it('trae las fichas que empatan, para poder elegir', async () => {
    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes: r } = await entrantesSinIdentificar({})

    const empate = r.find((e) => e.telefono === '56922222222')
    expect(empate?.candidatos).toHaveLength(2)
    expect(empate?.candidatos?.map((c) => c.nombre)).toContain('O-king barber')
  })

  it('al desconocido lo deja como desconocido, sin candidatos', async () => {
    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes: r } = await entrantesSinIdentificar({})

    const nuevo = r.find((e) => e.telefono === '56911111111')
    expect(nuevo?.motivo).toBe('desconocido')
    expect(nuevo?.candidatos).toBeUndefined()
  })

  it('quien ya tiene ficha no aparece', async () => {
    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes: r } = await entrantesSinIdentificar({})

    expect(r.map((e) => e.telefono)).not.toContain('56933333333')
  })

  it('si la consulta falla, muestra a la persona en vez de esconderla', async () => {
    // Preferible mostrar a alguien de más que perder un cliente potencial en
    // silencio. Lo que no se hace es inventar que tiene ficha.
    h.resolverDestinatario.mockRejectedValue(new Error('base caída'))

    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes: r } = await entrantesSinIdentificar({})

    expect(r).toHaveLength(3)
    expect(r.every((e) => e.motivo === 'desconocido')).toBe(true)
  })

  it('ignora hilos sin actividad: no es nadie esperando', async () => {
    h.obtenerConversaciones.mockResolvedValue([
      ...CONVERSACIONES,
      { id: 9, phone: '56944444444', name: 'Vacío', last_message_at: null, jid: null },
    ])

    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes: r } = await entrantesSinIdentificar({})

    expect(r.map((e) => e.telefono)).not.toContain('56944444444')
  })
})

describe('el tope de hilos no esconde gente en silencio', () => {
  it('informa cuántas conversaciones activas quedaron sin revisar', async () => {
    // 45 hilos activos contra un tope de 40: cinco personas quedan fuera.
    // Antes se recortaba sin decir nada y la bandeja mostraba un número que
    // parecía el total.
    const muchas = Array.from({ length: 45 }, (_, i) => ({
      id: 100 + i,
      phone: `5695000${String(i).padStart(4, '0')}`,
      name: `Hilo ${i}`,
      last_message_at: 1_700_000_000 - i,
      jid: null,
    }))
    h.obtenerConversaciones.mockResolvedValue(muchas)
    h.resolverDestinatario.mockResolvedValue({ estado: 'desconocido' })

    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const r = await entrantesSinIdentificar({})

    expect(r.entrantes).toHaveLength(40)
    expect(r.sinRevisar).toBe(5)
  })

  it('sin recorte, sinRevisar es 0', async () => {
    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const r = await entrantesSinIdentificar({})

    expect(r.sinRevisar).toBe(0)
  })

  it('los ambiguos van primero: ignorarlos ensucia dos fichas', async () => {
    const { entrantesSinIdentificar } = await import('./sin-identificar')
    const { entrantes } = await entrantesSinIdentificar({})

    const primerDesconocido = entrantes.findIndex((e) => e.motivo === 'desconocido')
    const ultimoAmbiguo = entrantes.map((e) => e.motivo).lastIndexOf('ambiguo')
    if (primerDesconocido !== -1 && ultimoAmbiguo !== -1) {
      expect(ultimoAmbiguo).toBeLessThan(primerDesconocido)
    }
  })
})
