import { describe, it, expect, vi } from 'vitest'
import { sufijoTelefono, buscarDestinatario } from './destinatario'

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
