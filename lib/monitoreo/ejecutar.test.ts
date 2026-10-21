import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { monitorearSaas } from './ejecutar'
import type { MonitoreoSaasRepository } from '@/lib/repos/monitoreo-saas'
import type { SaasMonitoreado } from '@/lib/types/monitoreo'

const SAAS: SaasMonitoreado = {
  id: '00000000-0000-4000-8000-000000000001',
  proyecto_id: '00000000-0000-4000-8000-000000000002',
  clave: 'BITACORA',
  porcentaje_tryvex: 10,
  schema_esperado: null,
  activo: true,
  created_at: '2026-10-20T00:00:00Z',
}

function repoFalso() {
  return {
    ultimoSnapshotOk: vi.fn().mockResolvedValue(null),
    guardarSnapshot: vi.fn().mockResolvedValue(undefined),
    estadosRecientes: vi.fn().mockResolvedValue([0]),
    insertarAlertas: vi.fn().mockResolvedValue(0),
    resolverAbiertas: vi.fn().mockResolvedValue(undefined),
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('monitorearSaas', () => {
  it('sin MONITOREO_URL_/MONITOREO_TOKEN_ de su clave guarda un snapshot de error y no pide nada', async () => {
    vi.stubEnv('MONITOREO_URL_BITACORA', '')
    vi.stubEnv('MONITOREO_TOKEN_BITACORA', '')
    // El token de OTRA clave existe, pero no se puede usar.
    vi.stubEnv('MONITOREO_URL_OTRO', 'https://otro.example.com')
    vi.stubEnv('MONITOREO_TOKEN_OTRO', 'token-otro')
    const repo = repoFalso()
    const fetchFalso = vi.fn()

    const r = await monitorearSaas(repo as unknown as MonitoreoSaasRepository, SAAS, fetchFalso)

    expect(fetchFalso).not.toHaveBeenCalled()
    expect(repo.guardarSnapshot).toHaveBeenCalledWith({
      saasId: SAAS.id,
      httpStatus: 0,
      payload: undefined,
      error: 'Faltan MONITOREO_URL_BITACORA o MONITOREO_TOKEN_BITACORA',
    })
    expect(r).toMatchObject({ ok: false, http_status: 0 })
    expect(repo.resolverAbiertas).not.toHaveBeenCalled()
  })
})
