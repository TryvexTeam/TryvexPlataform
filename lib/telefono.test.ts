import { describe, it, expect } from 'vitest'
import {
  normalizarTelefonoCL,
  esTelefonoValido,
  telefonoLegible,
  urlLlamada,
  urlWhatsApp,
} from './telefono'

describe('normalizarTelefonoCL', () => {
  it('deja intacto un móvil que ya viene en E.164', () => {
    // Arrange
    const entrada = '+56929159103'

    // Act
    const resultado = normalizarTelefonoCL(entrada)

    // Assert
    expect(resultado).toBe('+56929159103')
  })

  it('normaliza el segundo móvil correcto de la base', () => {
    const entrada = '+56935730606'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56935730606')
  })

  it('agrega el código de país a un móvil de 9 dígitos sin prefijo', () => {
    // Este es el caso que rompía el botón de llamar: tel:920394617 no marca.
    const entrada = '920394617'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56920394617')
  })

  it('ignora espacios en un número escrito a mano', () => {
    const entrada = '+56 9 2915 9103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56929159103')
  })

  it('ignora guiones', () => {
    const entrada = '9-2915-9103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56929159103')
  })

  it('ignora paréntesis y puntos', () => {
    const entrada = '(+56) 9.2915.9103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56929159103')
  })

  it('acepta el prefijo 56 sin el signo +', () => {
    const entrada = '56929159103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56929159103')
  })

  it('descarta el cero de salida a la izquierda', () => {
    const entrada = '0929159103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56929159103')
  })

  it('descarta el doble cero de salida internacional', () => {
    const entrada = '0056929159103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56929159103')
  })

  it('normaliza un número de red fija (2 + 8 dígitos)', () => {
    const entrada = '2 2345 6789'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56223456789')
  })

  it('normaliza una red fija que ya trae código de país', () => {
    const entrada = '+56 2 2345 6789'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBe('+56223456789')
  })

  it('devuelve null para null', () => {
    const resultado = normalizarTelefonoCL(null)

    expect(resultado).toBeNull()
  })

  it('devuelve null para undefined (integrante sin teléfono cargado)', () => {
    const resultado = normalizarTelefonoCL(undefined)

    expect(resultado).toBeNull()
  })

  it('devuelve null para el string vacío', () => {
    const resultado = normalizarTelefonoCL('')

    expect(resultado).toBeNull()
  })

  it('devuelve null para un texto sin dígitos', () => {
    const resultado = normalizarTelefonoCL('no tiene')

    expect(resultado).toBeNull()
  })

  it('devuelve null para 8 dígitos sueltos en vez de adivinar el primer dígito', () => {
    // Arrange: falta el 9 o el 2 inicial; completarlo sería llamar a un desconocido.
    const entrada = '29159103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBeNull()
  })

  it('devuelve null si el número nacional empieza en 1', () => {
    const entrada = '129159103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBeNull()
  })

  it('devuelve null si el número nacional empieza en 0 tras el código de país', () => {
    const entrada = '+56029159103'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBeNull()
  })

  it('devuelve null para un número con demasiados dígitos', () => {
    const entrada = '+569291591030000'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBeNull()
  })

  it('devuelve null para un número extranjero que no es chileno', () => {
    const entrada = '+1 415 555 2671'

    const resultado = normalizarTelefonoCL(entrada)

    expect(resultado).toBeNull()
  })
})

describe('esTelefonoValido', () => {
  it('acepta un móvil chileno normalizable', () => {
    expect(esTelefonoValido('920394617')).toBe(true)
  })

  it('acepta un E.164 chileno completo', () => {
    expect(esTelefonoValido('+56929159103')).toBe(true)
  })

  it('rechaza el campo vacío', () => {
    expect(esTelefonoValido('')).toBe(false)
  })

  it('rechaza null', () => {
    expect(esTelefonoValido(null)).toBe(false)
  })

  it('rechaza un número incompleto', () => {
    expect(esTelefonoValido('29159103')).toBe(false)
  })
})

describe('telefonoLegible', () => {
  it('agrupa un móvil como +56 9 2915 9103', () => {
    // Arrange
    const e164 = '+56929159103'

    // Act
    const resultado = telefonoLegible(e164)

    // Assert
    expect(resultado).toBe('+56 9 2915 9103')
  })

  it('agrupa una red fija con el mismo patrón', () => {
    const resultado = telefonoLegible('+56223456789')

    expect(resultado).toBe('+56 2 2345 6789')
  })

  it('devuelve tal cual un valor que no es E.164 chileno, para no romper el render', () => {
    const resultado = telefonoLegible('920394617')

    expect(resultado).toBe('920394617')
  })
})

describe('urlLlamada', () => {
  it('arma un tel: conservando el + para marcar internacional', () => {
    const resultado = urlLlamada('+56929159103')

    expect(resultado).toBe('tel:+56929159103')
  })
})

describe('urlWhatsApp', () => {
  it('arma un wa.me sin el + porque WhatsApp solo acepta dígitos', () => {
    const resultado = urlWhatsApp('+56929159103')

    expect(resultado).toBe('https://wa.me/56929159103')
  })
})
