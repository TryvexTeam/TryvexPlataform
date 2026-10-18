import { describe, it, expect, vi } from 'vitest'
import { LeadsRepository } from './leads'

/**
 * Lo que estas pruebas cuidan es UNA regla: que borrar deje de ser el efecto
 * de un clic. No prueban Supabase — prueban las decisiones que tomamos encima.
 */

/** Cliente falso que registra qué se le pidió a la base. */
function clienteFalso(filaSingle: unknown = { eliminado_at: '2026-09-13T00:00:00Z' }) {
  const llamadas: { tabla: string; op: string; payload?: unknown }[] = []

  const query = {
    update(payload: unknown) {
      llamadas.push({ tabla: query._tabla, op: 'update', payload })
      return query
    },
    delete() {
      llamadas.push({ tabla: query._tabla, op: 'delete' })
      return query
    },
    select() { return query },
    eq() { return query },
    is() { return query },
    not() { return query },
    order() { return query },
    limit() { return Promise.resolve({ data: [], error: null }) },
    single() { return Promise.resolve({ data: filaSingle, error: filaSingle ? null : { message: 'no hay' } }) },
    _tabla: '',
    then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
      return Promise.resolve({ data: [], error: null }).then(resolve)
    },
  }

  const sb = {
    from(tabla: string) { query._tabla = tabla; return query },
  }

  return { sb, llamadas }
}

describe('papelera de leads', () => {
  it('mover a la papelera NO borra: solo marca eliminado_at', async () => {
    const { sb, llamadas } = clienteFalso()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new LeadsRepository(sb as any).moverAPapelera('lead-1')

    expect(llamadas.some((l) => l.op === 'delete')).toBe(false)
    const update = llamadas.find((l) => l.op === 'update')
    expect(update?.tabla).toBe('fact_leads')
    expect((update?.payload as { eliminado_at: string }).eliminado_at).toBeTruthy()
  })

  it('restaurar devuelve el lead al tablero poniendo eliminado_at en null', async () => {
    const { sb, llamadas } = clienteFalso()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new LeadsRepository(sb as any).restaurar('lead-1')

    const update = llamadas.find((l) => l.op === 'update')
    expect((update?.payload as { eliminado_at: null }).eliminado_at).toBeNull()
  })

  it('borrar definitivo un lead que NO está en la papelera se rechaza', async () => {
    // Es la salvaguarda central: sin esto, el borrado real vuelve a estar a un
    // clic de distancia y se lleva el historial en cascada.
    const { sb, llamadas } = clienteFalso({ eliminado_at: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new LeadsRepository(sb as any)

    await expect(repo.borrarDefinitivo('lead-1')).rejects.toThrow(/papelera/i)
    expect(llamadas.some((l) => l.op === 'delete')).toBe(false)
  })

  it('borrar definitivo sí borra cuando el lead ya está en la papelera', async () => {
    const { sb, llamadas } = clienteFalso({ eliminado_at: '2026-09-13T00:00:00Z' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new LeadsRepository(sb as any).borrarDefinitivo('lead-1')

    expect(llamadas.some((l) => l.op === 'delete' && l.tabla === 'fact_leads')).toBe(true)
  })

  it('borrar definitivo un lead inexistente no borra nada', async () => {
    const { sb, llamadas } = clienteFalso(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new LeadsRepository(sb as any)

    await expect(repo.borrarDefinitivo('fantasma')).rejects.toThrow()
    expect(llamadas.some((l) => l.op === 'delete')).toBe(false)
  })
})

describe('bitácora', () => {
  it('registrar nunca tira, aunque la base falle', async () => {
    // La bitácora acompaña a la acción; si gobernara la petición, mover un lead
    // podría terminar en error DESPUÉS de haberlo movido.
    const { ActividadRepository } = await import('./actividad')
    const sb = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'caída' } }) }) }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(new ActividadRepository(sb as any).registrar({
      integrante_id: null, tipo_evento: 'lead_a_papelera',
    })).resolves.toBeUndefined()
  })
})
