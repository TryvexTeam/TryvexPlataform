import { describe, it, expect } from 'vitest'
import { validarArchivos, MAX_ARCHIVOS, MAX_BYTES, MAX_MB } from './adjuntos'

const archivo = (nombre: string, bytes: number) => ({ nombre, bytes })

describe('validarArchivos', () => {
  it('acepta una lista vacía (un mensaje puede ser solo texto)', () =>
    expect(validarArchivos([])).toBeNull())

  it('acepta un archivo normal', () =>
    expect(validarArchivos([archivo('informe.pdf', 2 * 1024 * 1024)])).toBeNull())

  it('acepta justo en el límite', () =>
    expect(validarArchivos([archivo('grande.zip', MAX_BYTES)])).toBeNull())

  it('rechaza pasado el límite y dice el peso y el máximo', () => {
    const motivo = validarArchivos([archivo('enorme.zip', MAX_BYTES + 1)])
    expect(motivo).toContain('enorme.zip')
    expect(motivo).toContain(`${MAX_MB} MB`)
  })

  it('rechaza un archivo vacío', () =>
    expect(validarArchivos([archivo('vacio.txt', 0)])).toContain('vacío'))

  it('rechaza cuando son demasiados', () => {
    const muchos = Array.from({ length: MAX_ARCHIVOS + 1 }, (_, i) => archivo(`f${i}.png`, 10))
    expect(validarArchivos(muchos)).toContain(`${MAX_ARCHIVOS}`)
  })

  it('acepta exactamente el máximo de archivos', () => {
    const justos = Array.from({ length: MAX_ARCHIVOS }, (_, i) => archivo(`f${i}.png`, 10))
    expect(validarArchivos(justos)).toBeNull()
  })

  it('nombra el archivo culpable, no el primero de la lista', () => {
    const motivo = validarArchivos([archivo('ok.png', 10), archivo('culpable.mov', MAX_BYTES + 1)])
    expect(motivo).toContain('culpable.mov')
  })
})
