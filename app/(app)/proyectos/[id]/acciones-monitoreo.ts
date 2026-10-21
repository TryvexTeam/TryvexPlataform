'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { MonitoreoSaasRepository } from '@/lib/repos/monitoreo-saas'
import { monitorearSaas } from '@/lib/monitoreo/ejecutar'

export type ResultadoActualizar = { ok: true; mensaje: string } | { ok: false; error: string }

/** El SaaS acepta 1 pedido por minuto por token; pedir antes solo gasta un 429. */
const ESPERA_MINIMA_MS = 60_000

const IdSchema = z.string().uuid('El identificador no es válido.')

/**
 * "Actualizar ahora": el mismo pull del cron, a pedido. Solo quien gestiona
 * finanzas (o el dueño). El permiso se valida aquí, en el servidor; la escritura
 * va con service role porque las tablas no tienen policies de escritura.
 */
export async function actualizarMonitoreo(proyectoId: string): Promise<ResultadoActualizar> {
  const id = IdSchema.safeParse(proyectoId)
  if (!id.success) return { ok: false, error: id.error.issues[0].message }

  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { ok: false, error: 'Hay que iniciar sesión.' }
    const perfil = await new PermisosRepository(supabase).misPermisos(user.id)
    if (!puede(perfil, 'gestionar_finanzas')) {
      return { ok: false, error: 'Solo quien gestiona finanzas puede actualizar el monitoreo.' }
    }

    const repo = new MonitoreoSaasRepository(createAdminClient())
    const saas = await repo.porProyecto(id.data)
    if (!saas) return { ok: false, error: 'Este proyecto no tiene un SaaS monitoreado.' }
    if (!saas.activo) return { ok: false, error: 'El monitoreo de este SaaS está pausado.' }

    const ultimo = await repo.ultimoSnapshot(saas.id)
    if (ultimo && Date.now() - Date.parse(ultimo.tomado_en) < ESPERA_MINIMA_MS) {
      return { ok: false, error: 'Se actualizó hace menos de un minuto. Espere un poco.' }
    }

    const r = await monitorearSaas(repo, saas)
    revalidatePath(`/proyectos/${id.data}`)
    if (!r.ok) return { ok: false, error: `El SaaS no entregó métricas válidas: ${r.error ?? `HTTP ${r.http_status}`}` }
    return {
      ok: true,
      mensaje: r.alertas_nuevas > 0 ? `Actualizado. ${r.alertas_nuevas} alerta(s) nueva(s).` : 'Actualizado, sin alertas nuevas.',
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo actualizar el monitoreo.' }
  }
}
