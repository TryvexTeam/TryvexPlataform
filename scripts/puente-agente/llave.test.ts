import { describe, it, expect } from 'vitest'
import { leerToken, rutaPermitida, sinTokens, urlCrm } from './llave.mjs'

describe('rutaPermitida', () => {
  it('deja pasar la API de agentes', () => {
    for (const r of ['/api/agentes/manual', '/api/agentes/encargos?todos=1', '/api/agentes/directivas?para=conversacion', '/api/agentes/mensajes?limite=20', '/api/agentes/wa-estado']) {
      expect(rutaPermitida(r), r).toBe(true)
    }
  })

  it('el token no sale hacia otra parte del CRM ni hacia otro dominio', () => {
    for (const r of [
      '/api/leads', '/api/agentes/../leads', '/api/agentes/%2e%2e/leads', '//evil.com/api/agentes/manual',
      'https://evil.com/api/agentes/manual', '/api/agentes@evil.com', '/api/agentes/manual#x',
      '/api/agentes\\..\\leads', 'api/agentes/manual', '', '/api/agentes/' + 'a'.repeat(400),
    ]) {
      expect(rutaPermitida(r), r).toBe(false)
    }
    expect(rutaPermitida(undefined)).toBe(false)
  })
})

describe('sinTokens', () => {
  it('oculta cualquier token en una respuesta', () => {
    expect(sinTokens('mi token es txa_AbC123xyz_9876 ok')).toBe('mi token es txa_[oculto] ok')
    expect(sinTokens('nada que ocultar')).toBe('nada que ocultar')
  })
})

describe('leerToken y urlCrm', () => {
  it('el token del entorno manda', () => {
    expect(leerToken({ TRYVEX_AGENTE_TOKEN: '  txa_x  ' }).token).toBe('txa_x')
  })
  it('sin token ni archivo, lo dice', () => {
    expect(leerToken({ TRYVEX_TOKEN_FILE: '/no/existe' }).token).toBeNull()
  })
  it('la URL del CRM sin barra final', () => {
    expect(urlCrm({ TRYVEX_CRM_URL: 'http://localhost:3000//' })).toBe('http://localhost:3000')
    expect(urlCrm({})).toBe('https://tryvexplataform.vercel.app')
  })
})
