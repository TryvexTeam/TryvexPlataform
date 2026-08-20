import { NextResponse, after, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { ActualizarPermisosSchema } from '@/lib/types/permisos'
import { revalidarEquipoEnLanding } from '@/lib/revalidate-landing'

/**
 * Reparto de accesos. Solo el dueño (es_superadmin) entra aquí.
 *
 * El candado de verdad está en la base: el trigger `guardar_flags_privilegio` rechaza
 * cualquier UPDATE de estas columnas que no venga del dueño, incluso si alguien llama
 * a Supabase directo saltándose esta ruta. Lo de aquí es para dar un 403 legible.
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const repo = new PermisosRepository(supabase)
  const yo = await repo.misPermisos(user.id)
  if (!yo?.es_superadmin) {
    return NextResponse.json({ success: false, error: 'Solo el administrador reparte accesos' }, { status: 403 })
  }

  return NextResponse.json({ success: true, data: await repo.listEquipo() })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const repo = new PermisosRepository(supabase)
  const yo = await repo.misPermisos(user.id)
  if (!yo?.es_superadmin) {
    return NextResponse.json({ success: false, error: 'Solo el administrador reparte accesos' }, { status: 403 })
  }

  const result = ActualizarPermisosSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { integrante_id, ...cambios } = result.data
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ success: false, error: 'No hay nada que cambiar' }, { status: 400 })
  }

  try {
    await repo.actualizar(integrante_id, cambios)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    if (msg === 'solo_superadmin') {
      return NextResponse.json({ success: false, error: 'Solo el administrador reparte accesos' }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }

  // `visible_en_landing` se reparte desde acá, y decide quién sale en
  // tryvex.tech/team. Sin este aviso el cambio esperaba al ISR de la landing:
  // hasta 15 minutos. Molesto al encender a alguien; malo al apagarlo, que es
  // justo cuando se quiere que desaparezca ya.
  //
  // Va en after() y no suelto como promesa: al devolver la respuesta el runtime
  // puede congelar la invocación antes de que el fetch llegue a salir.
  after(() => revalidarEquipoEnLanding())

  return NextResponse.json({ success: true })
}
