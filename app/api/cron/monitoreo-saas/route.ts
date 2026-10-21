import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { MonitoreoSaasRepository } from '@/lib/repos/monitoreo-saas'
import { monitorearSaas, type ResumenPull } from '@/lib/monitoreo/ejecutar'

/**
 * Cron diario: pide `tryvex.metrics/v1` a cada SaaS activo, guarda el snapshot
 * (también cuando falla) y registra alertas de ingresos alterados o caída.
 *
 * Falla cerrado como `cron/avisos`: sin CRON_SECRET definido no corre para
 * nadie (`proxy.ts` excluye `api/cron` del middleware, no hay otra red).
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secreto || auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const repo = new MonitoreoSaasRepository(createAdminClient())
  let saas
  try {
    saas = await repo.listarActivos()
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'No se pudo leer la configuración' },
      { status: 500 },
    )
  }

  // Uno por uno: un SaaS que falla no debe impedir monitorear al resto.
  const resultados: (ResumenPull | { saas_id: string; ok: false; error: string })[] = []
  for (const s of saas) {
    try {
      resultados.push(await monitorearSaas(repo, s))
    } catch (e) {
      resultados.push({ saas_id: s.id, ok: false, error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  }

  return NextResponse.json({ success: true, data: { monitoreados: saas.length, resultados } })
}
