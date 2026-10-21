import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const admin = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: admin, createClient: vi.fn() }))

import { GET } from './route'

const ORIGINAL = process.env.CRON_SECRET
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL
  admin.mockReset()
})

describe('cron monitoreo-saas', () => {
  it('401 sin CRON_SECRET definido, aunque traiga encabezado (falla cerrado)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(new Request('https://crm.test/api/cron/monitoreo-saas', { headers: { authorization: 'Bearer undefined' } }))
    expect(res.status).toBe(401)
    expect(admin).not.toHaveBeenCalled()
  })

  it('401 sin encabezado o con secreto equivocado', async () => {
    process.env.CRON_SECRET = 'correcto'
    expect((await GET(new Request('https://crm.test/x'))).status).toBe(401)
    const malo = await GET(new Request('https://crm.test/x', { headers: { authorization: 'Bearer otro' } }))
    expect(malo.status).toBe(401)
    expect(admin).not.toHaveBeenCalled()
  })

  it('con el secreto correcto llega a la base', async () => {
    process.env.CRON_SECRET = 'correcto'
    const eq = vi.fn().mockResolvedValue({ data: [], error: null })
    admin.mockReturnValue({ from: () => ({ select: () => ({ eq }) }) })
    const res = await GET(new Request('https://crm.test/x', { headers: { authorization: 'Bearer correcto' } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { monitoreados: 0, resultados: [] } })
  })
})
