import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { MusicaRepository } from '@/lib/repos/musica'
import {
  aplicarComando,
  ComandoMusicaSchema,
  COMANDOS_DE_LECTURA,
  PistaSchema,
  siguiente,
  type ModoLoop,
  type Pista,
} from '@/lib/types/musica'

export const dynamic = 'force-dynamic'

/** Qué suena en este hilo. Lo pide el reproductor al montarse. */
export async function GET(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const conversacionId = new URL(req.url).searchParams.get('conversacion')
  if (!conversacionId) return NextResponse.json({ success: false, error: 'Falta conversacion' }, { status: 400 })

  // La membresía se verifica acá y no se deja solo en manos de RLS: la policy
  // devolvería una sala vacía en vez de un 403, y "no hay música" y "no es tu
  // hilo" son cosas distintas para quien lee la respuesta.
  if (!(await new ChatRepository(supabase).esMiembro(conversacionId, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esta conversación' }, { status: 403 })
  }

  try {
    const sala = await new MusicaRepository(supabase).sala(conversacionId)
    return NextResponse.json({ success: true, data: sala })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error leyendo la sala' },
      { status: 500 },
    )
  }
}

/**
 * Un comando, calcado de un bot de música: play, pause, skip, loop…
 *
 * Toda la lógica de qué le pasa a la sala vive en `aplicarComando`, que es puro y
 * está probado. Acá solo se verifica quién manda el comando y se persiste el
 * resultado. Ese reparto es deliberado: el cálculo de la posición es el corazón
 * de la sincronización y no puede tener dos versiones.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = ComandoMusicaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 })

  const { conversacion_id, comando, argumento } = parsed.data

  if (!(await new ChatRepository(supabase).esMiembro(conversacion_id, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esta conversación' }, { status: 403 })
  }

  // `play` sin pista no tiene qué reproducir. Se rechaza acá, con un mensaje que
  // dice qué falta, en vez de dejar que el reductor devuelva un cambio vacío que
  // el cliente leería como "funcionó pero no pasó nada".
  const pista = esPista(argumento) ? marcarAutor(argumento, perfil.id) : undefined
  if (comando === 'play' && !pista) {
    return NextResponse.json({ success: false, error: 'Falta la pista que quieres poner' }, { status: 400 })
  }

  const modo = typeof argumento === 'string' ? (argumento as ModoLoop) : undefined

  try {
    const musica = new MusicaRepository(supabase)
    const sala = await musica.sala(conversacion_id)
    const { cambio, mensaje } = aplicarComando(sala, comando, new Date(), { pista, modo })

    // `queue` y `nowplaying` solo leen. Escribirlos igual dispararía un evento de
    // Realtime en cada consulta y haría que los reproductores de los demás
    // recalcularan su posición por nada.
    if (COMANDOS_DE_LECTURA.includes(comando) || Object.keys(cambio).length === 0) {
      return NextResponse.json({ success: true, data: { sala, mensaje } })
    }

    const nueva = await musica.guardar(conversacion_id, cambio)
    return NextResponse.json({ success: true, data: { sala: nueva, mensaje } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error ejecutando el comando' },
      { status: 500 },
    )
  }
}

/**
 * Avanzar la cola porque la pista terminó sola.
 *
 * Va aparte de `skip` por una razón concreta: `skip` con la repetición de pista
 * puesta sale del bucle (si no, el botón parecería roto), y un final natural con
 * esa misma repetición tiene que volver a empezar la misma canción. Son dos
 * intenciones distintas y mezclarlas rompe una de las dos.
 *
 * Lo manda un solo cliente — ver `mandaAvanzar` en `lib/types/musica.ts`.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const cuerpo = (await req.json().catch(() => null)) as { conversacion_id?: string; video_id?: string } | null
  const conversacionId = cuerpo?.conversacion_id
  if (!conversacionId) return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 })

  if (!(await new ChatRepository(supabase).esMiembro(conversacionId, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esta conversación' }, { status: 403 })
  }

  try {
    const musica = new MusicaRepository(supabase)
    const sala = await musica.sala(conversacionId)

    // El cliente dice qué pista creía que estaba terminando. Si ya no es esa, es
    // que alguien saltó mientras el aviso viajaba: avanzar ahora se comería la
    // canción recién puesta. Es la carrera que hace que la cola salte de a dos.
    if (cuerpo.video_id && sala.video_id !== cuerpo.video_id) {
      return NextResponse.json({ success: true, data: { sala, mensaje: 'Ya había avanzado' } })
    }

    const nueva = await musica.guardar(conversacionId, siguiente(sala, new Date()))
    return NextResponse.json({ success: true, data: { sala: nueva, mensaje: 'Siguiente' } })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error avanzando la cola' },
      { status: 500 },
    )
  }
}

function esPista(argumento: unknown): argumento is Pista {
  return PistaSchema.safeParse(argumento).success
}

/** Quien manda el comando es quien pone la pista. No se acepta del cliente. */
function marcarAutor(pista: Pista, integranteId: string): Pista {
  return { ...pista, puesta_por: integranteId }
}
