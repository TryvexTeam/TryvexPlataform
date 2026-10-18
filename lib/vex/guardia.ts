import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ErrorAgente } from './agente'

/**
 * Guardia común de las rutas que hablan con el agente.
 *
 * Todas exigen lo mismo —sesión y además integrante activo— porque todas dejan
 * tocar el WhatsApp del equipo: pausar al agente, cambiar su modelo o leer las
 * conversaciones con los leads. Repetir esa comprobación en cada handler es
 * cómo se termina olvidando en el séptimo.
 */

/** Devuelve una respuesta de rechazo, o `null` si puede pasar. */
export async function rechazarSiNoEsIntegrante(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const integrantes = new IntegrantesRepository(supabase)
  const perfil = await integrantes.getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json(
      { success: false, error: 'Solo integrantes activos pueden operar el agente' },
      { status: 403 }
    )
  }

  return null
}

/**
 * Ejecuta la llamada al agente y traduce sus fallos a la respuesta del CRM.
 *
 * El `status` del agente se propaga tal cual para que la vista distinga «no
 * responde» de «rechazó la credencial»: son problemas distintos y se arreglan
 * en lugares distintos.
 */
export async function responderDelAgente<T>(
  operacion: () => Promise<T>
): Promise<NextResponse> {
  try {
    return NextResponse.json({ success: true, data: await operacion() })
  } catch (error: unknown) {
    if (error instanceof ErrorAgente) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[vex/agente] fallo inesperado:', error)
    return NextResponse.json(
      { success: false, error: 'No se pudo hablar con el agente' },
      { status: 500 }
    )
  }
}
