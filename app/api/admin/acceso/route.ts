import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PermisosRepository } from '@/lib/repos/permisos'
import { AccesoRepository, ErrorAcceso } from '@/lib/repos/acceso'
import { CambiarAccesoSchema, type IntegranteAcceso, type ResultadoAcceso } from '@/lib/types/acceso'

/**
 * Quitar y devolver el acceso a la app.
 *
 * A diferencia de /api/permisos, aca NO hay un trigger en la base que sirva de
 * candado final: cerrar sesiones y banear se hacen con la clave de servicio, que
 * ignora la RLS por definicion. O sea que esta ruta ES el candado. Por eso las
 * comprobaciones se hacen todas del lado del servidor y ninguna se apoya en que la
 * UI haya escondido un boton.
 */

type Actor = { id: string; nombre: string; email: string }

/** Sesion + condicion de dueno. Devuelve la respuesta de rechazo o el actor. */
async function autorizar(): Promise<{ error: NextResponse } | { actor: Actor }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }) }
  }

  const yo = await new PermisosRepository(supabase).misPermisos(user.id)

  // `activo` se comprueba aparte del flag de dueno: un superadmin al que ya le
  // revocaron el acceso no puede seguir revocando a otros desde una pestana abierta.
  if (!yo?.es_superadmin || !yo.activo) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Solo el administrador puede cambiar accesos' },
        { status: 403 },
      ),
    }
  }

  return { actor: { id: yo.id, nombre: yo.nombre, email: yo.email } }
}

export async function GET() {
  const auth = await autorizar()
  if ('error' in auth) return auth.error

  try {
    const repo = new AccesoRepository(createAdminClient())
    const equipo: IntegranteAcceso[] = await repo.listEquipo()
    return NextResponse.json({ success: true, data: equipo })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'No se pudo leer el equipo' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizar()
  if ('error' in auth) return auth.error
  const { actor } = auth

  const cuerpo = await req.json().catch(() => null)
  const parsed = CambiarAccesoSchema.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues }, { status: 400 })
  }
  const { integrante_id, activo, motivo } = parsed.data

  // Nadie se revoca a si mismo. Un dueno que se auto-revoca deja la app sin quien
  // pueda revertirlo: no hay pantalla ni correo para recuperar esto.
  if (integrante_id === actor.id) {
    return NextResponse.json(
      { success: false, error: 'No puedes quitarte el acceso a ti mismo. Pideselo a otro administrador.' },
      { status: 400 },
    )
  }

  const repo = new AccesoRepository(createAdminClient())

  let integrante: IntegranteAcceso | null
  try {
    integrante = await repo.getIntegrante(integrante_id)
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'error' },
      { status: 500 },
    )
  }

  if (!integrante) {
    return NextResponse.json({ success: false, error: 'Ese integrante no existe' }, { status: 404 })
  }

  // Nada que hacer. Se responde 200 y no 400: el estado pedido es el que hay, y
  // devolver error por eso haria fallar un reintento legitimo tras un timeout.
  if (integrante.activo === activo) {
    const sinCambios: ResultadoAcceso = {
      integrante_id: integrante.id,
      nombre: integrante.nombre,
      activo: integrante.activo,
      sesiones_cerradas: 0,
    }
    return NextResponse.json({ success: true, data: sinCambios })
  }

  // El ultimo dueno activo no se puede revocar. Se cuenta contra la base y no
  // contra la lista que tenga la UI, que puede estar desactualizada si otro
  // administrador revoco a alguien hace un segundo.
  if (!activo && integrante.es_superadmin) {
    try {
      const quedan = await repo.contarSuperadminsActivos()
      if (quedan <= 1) {
        return NextResponse.json(
          {
            success: false,
            error: 'Es el ultimo administrador activo. Nombra a otro antes de quitarle el acceso.',
          },
          { status: 400 },
        )
      }
    } catch (e) {
      // Si no se puede contar, no se revoca. Adivinar aca es como se deja una
      // cuenta sin dueno.
      return NextResponse.json(
        {
          success: false,
          error: `No se pudo verificar cuantos administradores quedan, asi que no se revoco nada: ${e instanceof Error ? e.message : 'error'}`,
        },
        { status: 500 },
      )
    }
  }

  try {
    let sesionesCerradas = 0
    if (activo) {
      await repo.restaurar(integrante)
    } else {
      sesionesCerradas = await repo.revocar(integrante)
    }

    await repo.registrar({
      integrante,
      accion: activo ? 'restaurado' : 'revocado',
      actor,
      motivo,
      sesionesCerradas,
    })

    const resultado: ResultadoAcceso = {
      integrante_id: integrante.id,
      nombre: integrante.nombre,
      activo,
      sesiones_cerradas: sesionesCerradas,
    }
    return NextResponse.json({ success: true, data: resultado })
  } catch (e) {
    // Una revocacion a medias no es un exito. Se responde con el estado real en el
    // que quedo la persona, porque "fallo" a secas dejaria al administrador sin
    // saber si tiene que reintentar o si el problema ya esta contenido.
    if (e instanceof ErrorAcceso) {
      console.error(`[acceso] fallo en etapa "${e.etapa}" para ${integrante.email}:`, e.message)
      return NextResponse.json(
        { success: false, error: `La revocacion quedo incompleta. ${e.estado}`, etapa: e.etapa },
        { status: 500 },
      )
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'error' },
      { status: 500 },
    )
  }
}
