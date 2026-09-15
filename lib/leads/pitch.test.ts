import { describe, expect, it } from 'vitest'

import { estadoWebDelLead, generarGuionAuto } from './pitch'
import type { Lead } from '@/lib/types/lead'

/**
 * El guion afirmaba "no tienes un sitio web propio" para TODOS los leads.
 *
 * El 13,5% de la cartera (67 de 496, medido con el auditor el 11-sep) tiene un
 * dominio que responde con su nombre. A esos, esa frase les es falsa en el
 * primer renglón — y el límite de Cristian fue textual: "no información falsa".
 *
 * Estos tests fijan los tres estados, los mismos que ya usaba `lib/vex/draft.ts`.
 */

function lead(extra: Partial<Lead> = {}): Lead {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    nombre_negocio: 'Barbería Test',
    nicho: 'barberías',
    localidad: 'Providencia, Región Metropolitana',
    telefono: '+56 9 1111 1111',
    estado: 'sin_contactar',
    tiene_web: false,
    url_web: null,
    google_rating: 4.8,
    google_resenas: 120,
    instagram: null,
    nombre_contacto: null,
    ...extra,
  } as Lead
}

describe('estadoWebDelLead — los tres estados', () => {
  it('tiene_web=true es "si"', () => {
    expect(estadoWebDelLead(lead({ tiene_web: true }))).toBe('si')
  })

  it('tiene_web=false sin url_web es "no"', () => {
    expect(estadoWebDelLead(lead({ tiene_web: false, url_web: null }))).toBe('no')
  })

  it('tiene_web=false CON url_web es "no-sabemos", no "no"', () => {
    // Este es el caso de los 67 que cargó el auditor: el dominio responde, pero
    // puede ser un sitio parqueado. No alcanza para afirmar, sí para dejar de negar.
    expect(estadoWebDelLead(lead({ tiene_web: false, url_web: 'https://x.cl' }))).toBe('no-sabemos')
  })

  it('tiene_web nulo es "no-sabemos": un dato ausente no es un "no"', () => {
    expect(estadoWebDelLead(lead({ tiene_web: null, url_web: null }))).toBe('no-sabemos')
  })

  it('una url_web en blanco no cuenta como dato', () => {
    expect(estadoWebDelLead(lead({ tiene_web: false, url_web: '   ' }))).toBe('no')
  })
})

describe('generarGuionAuto — la señal no miente sobre la web', () => {
  const textoDe = (l: Lead) => generarGuionAuto(l).turnos.map((t) => t.texto).join(' ')

  it('a quien SÍ tiene web, nunca le dice que no tiene', () => {
    const t = textoDe(lead({ tiene_web: true }))
    expect(t).not.toContain('no tienes un sitio web propio')
    expect(t).toContain('ya tienen su sitio web')
  })

  it('a quien no sabemos, tampoco le afirma ninguna de las dos', () => {
    const t = textoDe(lead({ tiene_web: false, url_web: 'https://barberiatest.cl' }))
    expect(t).not.toContain('no tienes un sitio web propio')
    expect(t).not.toContain('ya tienen su sitio web')
    expect(t).toContain('no sé si tienen sitio web propio')
  })

  it('a quien NO tiene, mantiene el guion de siempre', () => {
    const t = textoDe(lead({ tiene_web: false, url_web: null }))
    expect(t).toContain('no tienes un sitio web propio')
  })

  it('a quien tiene web le ofrece automatizar, no una página', () => {
    const g = generarGuionAuto(lead({ tiene_web: true }))
    expect(g.resumen).toContain('Ya tienen sitio')
    const t = g.turnos.map((x) => x.texto).join(' ')
    expect(t).toContain('reserve solo')
    // Y no le vende lo que ya tiene
    expect(t).not.toContain('casi 8 de cada 10 pymes')
  })

  it('a quien tiene web le pregunta por el tiempo, no por los clientes perdidos', () => {
    const t = textoDe(lead({ tiene_web: true }))
    expect(t).toContain('cuántas horas a la semana')
    expect(t).not.toContain('cuántos se te van así')
  })

  it('si no sabemos, el resumen tampoco promete una pagina', () => {
    const g = generarGuionAuto(lead({ tiene_web: false, url_web: 'https://x.cl' }))
    expect(g.resumen).toContain('No sabemos si tienen sitio')
    expect(g.resumen).not.toContain('Sitio web con agenda')
  })

  // El bug que esto cierra: el turno de "la señal" decia honestamente "no se si
  // tienen sitio web" y cuatro turnos despues el del "porque" le ofrecia hacerle
  // uno igual. El mismo guion se contradecia, y el lead escuchaba que no
  // miramos su negocio. Reportado por Cristian con Opticas Premium, que tiene
  // opticaspremium.com.
  it('si no sabemos, el porque NO afirma que no tiene pagina ni se la ofrece derecho', () => {
    const t = textoDe(lead({ tiene_web: false, url_web: 'https://opticaspremium.com' }))
    expect(t).not.toContain('tampoco tienen página web propia')
    expect(t).not.toContain('qué te estás perdiendo')
    // Ofrece las dos salidas, condicionadas a lo que conteste.
    expect(t).toContain('si todavía no tienen sitio')
    expect(t).toContain('si ya tienen uno')
  })

  it('si no sabemos, la implicacion no da por hecho que no lo encuentran', () => {
    const t = textoDe(lead({ tiene_web: false, url_web: 'https://x.cl' }))
    expect(t).not.toContain('te busca y no te encuentra')
    expect(t).toContain('terminas atendiendo tú mismo')
  })

  it('con web confirmada el porque sigue sin ofrecer una pagina', () => {
    const t = textoDe(lead({ tiene_web: true }))
    expect(t).not.toContain('tampoco tienen página web propia')
    expect(t).toContain('Tener la página es el primer paso y ya lo dieron')
  })

  it('el guion completo sigue teniendo todos sus turnos en los tres estados', () => {
    for (const l of [
      lead({ tiene_web: true }),
      lead({ tiene_web: false, url_web: 'https://x.cl' }),
      lead({ tiene_web: false, url_web: null }),
    ]) {
      const g = generarGuionAuto(l)
      expect(g.turnos.length).toBeGreaterThanOrEqual(6)
      expect(g.resumen.length).toBeGreaterThan(10)
      expect(g.editado).toBe(false)
    }
  })
})
