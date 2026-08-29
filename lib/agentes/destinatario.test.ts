import { describe, it, expect } from 'vitest'
import { sufijoTelefono, buscarDestinatario, resolverDestinatario } from './destinatario'

/**
 * El caso que este módulo resuelve, con datos reales de la base: el mismo
 * número está escrito como `+56 9 8337 6557` en la ficha y llega como
 * `56983376557` desde WhatsApp. Comparar literal no encontraría nada.
 */

describe('sufijoTelefono', () => {
  it('reduce a los últimos 8 dígitos, sin importar el formato', () => {
    for (const formato of ['+56 9 8337 6557', '56983376557', '9 8337 6557', '(56) 9-8337-6557']) {
      expect(sufijoTelefono(formato)).toBe('83376557')
    }
  })

  it('rechaza lo que no alcanza a identificar a nadie', () => {
    expect(sufijoTelefono('1234567')).toBeNull()
    expect(sufijoTelefono('')).toBeNull()
    expect(sufijoTelefono(null)).toBeNull()
    expect(sufijoTelefono('sin dígitos')).toBeNull()
  })
})

/**
 * Supabase falso. La búsqueda va por RPC y no por `from(...)`: PostgREST no
 * permite filtrar por una expresión, y comparar el texto tal cual no encuentra
 * `+56 9 8337 6557` cuando llega `56983376557`.
 */
function baseFalsa(respuestas: Record<string, Array<{ id: string; nombre: string | null }>>) {
  const consultadas: string[] = []
  return {
    consultadas,
    async rpc(fn: string, args: { p_sufijo: string; p_tabla: string }) {
      expect(fn).toBe('buscar_por_telefono')
      consultadas.push(args.p_tabla)
      return { data: respuestas[args.p_tabla] ?? [] }
    },
  }
}

describe('buscarDestinatario', () => {
  it('encuentra el lead por el sufijo aunque el formato difiera', async () => {
    const db = baseFalsa({
      fact_leads: [{ id: 'lead-1', nombre: 'Tienda BR' }],
    })

    const r = await buscarDestinatario(db, '56983376557')

    expect(r).toEqual({ tipo: 'lead', id: 'lead-1', nombre: 'Tienda BR' })
  })

  it('un cliente manda sobre la ficha de lead que le quedó de antes', async () => {
    const db = baseFalsa({
      dim_clientes: [{ id: 'cli-1', nombre: 'Barbería Central' }],
      fact_leads: [{ id: 'lead-viejo', nombre: 'Barbería Central' }],
    })

    const r = await buscarDestinatario(db, '56983376557')

    expect(r?.tipo).toBe('cliente')
    expect(r?.id).toBe('cli-1')
    // Ni siquiera llega a mirar los leads.
    expect(db.consultadas).not.toContain('fact_leads')
  })

  it('devuelve null ante un desconocido — el agente no debe responderle', async () => {
    expect(await buscarDestinatario(baseFalsa({}), '56900000000')).toBeNull()
  })

  it('no consulta nada si el teléfono es demasiado corto', async () => {
    const db = baseFalsa({ fact_leads: [{ id: 'x', nombre: 'y' }] })

    expect(await buscarDestinatario(db, '1234')).toBeNull()
    expect(db.consultadas).toHaveLength(0)
  })

  it('tolera una ficha sin nombre', async () => {
    const db = baseFalsa({ fact_leads: [{ id: 'lead-2', nombre: null }] })

    expect(await buscarDestinatario(db, '56983376557')).toEqual({
      tipo: 'lead',
      id: 'lead-2',
      nombre: null,
    })
  })
})

/**
 * El bug que estas pruebas cierran: antes la búsqueda terminaba en `limit 1` y
 * devolvía la primera ficha que saliera. Los pares de abajo son reales, sacados
 * de producción: dos negocios distintos con el mismo número anotado.
 */
describe('cuando dos fichas comparten el número, no se elige ninguna', () => {
  const empateReal = [
    { id: 'lead-urgencia', nombre: 'Urgencia electricas 24 Hrs' },
    { id: 'lead-sec', nombre: 'Electricista, Certificado SEC' },
  ]

  it('lo reporta como ambiguo, con los dos candidatos', async () => {
    const db = baseFalsa({ fact_leads: empateReal })

    const r = await resolverDestinatario(db, '56985917200')

    expect(r.estado).toBe('ambiguo')
    expect(r.estado === 'ambiguo' && r.candidatos.map((c) => c.nombre)).toEqual([
      'Urgencia electricas 24 Hrs',
      'Electricista, Certificado SEC',
    ])
  })

  it('la versión corta devuelve null: no cuelga el mensaje de una ficha al azar', async () => {
    expect(await buscarDestinatario(baseFalsa({ fact_leads: empateReal }), '56985917200')).toBeNull()
  })

  it('también vale para dos clientes con el mismo número', async () => {
    const db = baseFalsa({
      dim_clientes: [
        { id: 'cli-a', nombre: 'Uno' },
        { id: 'cli-b', nombre: 'Otro' },
      ],
      fact_leads: [{ id: 'lead-solo', nombre: 'No debería llegar acá' }],
    })

    const r = await resolverDestinatario(db, '56983376557')

    expect(r.estado).toBe('ambiguo')
    // Un empate entre clientes no se «resuelve» cayendo a los leads.
    expect(db.consultadas).not.toContain('fact_leads')
  })

  it('la misma ficha repetida NO es un empate', async () => {
    // La base puede devolver el mismo lead dos veces si el número calza por más
    // de un camino. Eso es una persona, no dos.
    const db = baseFalsa({
      fact_leads: [
        { id: 'lead-1', nombre: 'Tienda BR' },
        { id: 'lead-1', nombre: 'Tienda BR' },
      ],
    })

    const r = await resolverDestinatario(db, '56983376557')

    expect(r).toEqual({ estado: 'encontrado', destinatario: { tipo: 'lead', id: 'lead-1', nombre: 'Tienda BR' } })
  })
})

describe('resolverDestinatario distingue los tres desenlaces', () => {
  it('desconocido cuando no calza nadie', async () => {
    expect(await resolverDestinatario(baseFalsa({}), '56900000000')).toEqual({
      estado: 'desconocido',
    })
  })

  it('desconocido cuando el número que llega es demasiado corto', async () => {
    expect(await resolverDestinatario(baseFalsa({}), '1234')).toEqual({ estado: 'desconocido' })
  })

  it('encontrado cuando hay una sola ficha', async () => {
    const db = baseFalsa({ fact_leads: [{ id: 'lead-1', nombre: 'Tienda BR' }] })

    expect(await resolverDestinatario(db, '56983376557')).toEqual({
      estado: 'encontrado',
      destinatario: { tipo: 'lead', id: 'lead-1', nombre: 'Tienda BR' },
    })
  })
})
