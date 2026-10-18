import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { ChatRepository } from '@/lib/repos/chat'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ReenviarMensajeSchema, type Mensaje } from '@/lib/types/chat'
import { BUCKET_ADJUNTOS, sanearNombreArchivo } from '@/lib/chat/adjuntos-servidor'

interface AdjuntoOrigen {
  id: string
  ruta: string
  nombre: string
  tipo_mime: string
  bytes: number
  ancho: number | null
  alto: number | null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  const parsed = ReenviarMensajeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const repo = new ChatRepository(supabase)
  const original = await repo.obtenerMensaje(id)
  if (!original) return NextResponse.json({ success: false, error: 'No existe' }, { status: 404 })
  if (!(await repo.esMiembro(original.conversacion_id, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esa conversación' }, { status: 403 })
  }
  if (original.eliminado_at) {
    return NextResponse.json({ success: false, error: 'No se puede reenviar un mensaje eliminado' }, { status: 400 })
  }
  for (const conversacionId of parsed.data.conversaciones) {
    if (!(await repo.esMiembro(conversacionId, perfil.id))) {
      return NextResponse.json({ success: false, error: 'No perteneces a una conversación de destino' }, { status: 403 })
    }
  }

  try {
    const enviados: Mensaje[] = []
    for (const destino of parsed.data.conversaciones) {
      enviados.push(await copiarMensaje(repo, supabase, perfil.id, destino, original))
    }
    return NextResponse.json({ success: true, data: enviados })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'No se pudo reenviar' },
      { status: 500 },
    )
  }
}

async function copiarMensaje(
  repo: ChatRepository,
  supabase: Awaited<ReturnType<typeof createClient>>,
  autorId: string,
  destino: string,
  original: Mensaje & { rutas: AdjuntoOrigen[] },
): Promise<Mensaje> {
  const admin = createAdminClient()
  const lote = crypto.randomUUID()
  const copias: (AdjuntoOrigen & { rutaNueva: string })[] = []
  for (const [indice, adjunto] of original.rutas.entries()) {
    const rutaNueva = `${destino}/${lote}/${indice}-${sanearNombreArchivo(adjunto.nombre)}`
    const { error } = await admin.storage.from(BUCKET_ADJUNTOS).copy(adjunto.ruta, rutaNueva)
    if (error) {
      if (copias.length) await admin.storage.from(BUCKET_ADJUNTOS).remove(copias.map((a) => a.rutaNueva))
      throw new Error(`No se pudo copiar "${adjunto.nombre}"`)
    }
    copias.push({ ...adjunto, rutaNueva })
  }

  const nuevo = await repo.enviar(destino, autorId, original.contenido, { reenviado: true })
  if (copias.length) {
    const { data, error } = await supabase
      .from('mensaje_adjuntos')
      .insert(copias.map((a) => ({
        mensaje_id: nuevo.id,
        ruta: a.rutaNueva,
        nombre: a.nombre,
        tipo_mime: a.tipo_mime,
        bytes: a.bytes,
        ancho: a.ancho,
        alto: a.alto,
      })))
      .select('id, nombre, tipo_mime, bytes, ancho, alto')
    if (error) {
      await admin.storage.from(BUCKET_ADJUNTOS).remove(copias.map((a) => a.rutaNueva))
      throw new Error(error.message)
    }
    nuevo.adjuntos = data
  }

  const destinatarios = await repo.destinatariosPush(destino, autorId)
  if (destinatarios.length) {
    const { enviarPush } = await import('@/lib/push/server')
    await enviarPush(destinatarios, {
      titulo: 'Mensaje reenviado',
      cuerpo: original.contenido?.slice(0, 120) || 'Adjunto',
      link: `/chat?c=${destino}`,
      tag: `chat-${destino}`,
    })
  }
  return nuevo
}
