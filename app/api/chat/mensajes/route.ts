import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { EnviarMensajeSchema } from '@/lib/types/chat'
import { validarArchivos, MAX_ARCHIVOS } from '@/lib/types/adjuntos'
import { BUCKET_ADJUNTOS, rutaPerteneceA } from '@/lib/chat/adjuntos-servidor'

/** Un archivo que el navegador ya dejó en Storage y solo falta registrar. */
const SubidosSchema = z
  .array(
    z.object({
      ruta: z.string().min(1).max(500),
      nombre: z.string().min(1).max(255),
      tipo_mime: z.string().max(150),
      bytes: z.number().int().nonnegative(),
      ancho: z.number().int().positive().nullable().optional(),
      alto: z.number().int().positive().nullable().optional(),
    }),
  )
  .max(MAX_ARCHIVOS)

type SubidoDirecto = z.infer<typeof SubidosSchema>[number]

/** Mensajes de una conversación: ?conversacion=<uuid> */
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const params = new URL(req.url).searchParams
  const conversacionId = params.get('conversacion')
  if (!conversacionId) return NextResponse.json({ success: false, error: 'Falta la conversación' }, { status: 400 })

  const repo = new ChatRepository(supabase)
  if (!(await repo.esMiembro(conversacionId, perfil.id))) {
    return NextResponse.json({ success: false, error: 'No perteneces a esa conversación' }, { status: 403 })
  }

  // ?hilo=<uuid> devuelve las respuestas de ese mensaje en vez del flujo.
  const hilo = params.get('hilo')
  if (hilo) {
    return NextResponse.json({ success: true, data: await repo.listHilo(hilo, perfil.id) })
  }

  // ?fijados=1 devuelve solo los fijados, para la barra del tope.
  if (params.get('fijados')) {
    return NextResponse.json({ success: true, data: await repo.listFijados(conversacionId) })
  }

  // El id propio va al repo para saber cuáles reacciones son mías: sin eso, la UI
  // no puede pintar activa la que puse ni saber si el clic suma o resta.
  const mensajes = await repo.listMensajes(conversacionId, 100, perfil.id)
  await repo.marcarLeida(conversacionId, perfil.id)
  return NextResponse.json({ success: true, data: mensajes })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  // Dos formas de llegar: JSON cuando es solo texto, FormData cuando trae
  // archivos. Se resuelve todo en un viaje para que no queden subidas huérfanas
  // si el mensaje falla después.
  const esFormulario = (req.headers.get('content-type') ?? '').includes('multipart/form-data')
  let crudo: unknown
  let archivos: File[] = []
  // Archivos que el navegador YA subió a Storage con una URL firmada
  // (`/api/chat/adjuntos/firmar`). Es el camino normal desde el 21-ago-2026:
  // por acá el archivo nunca pasa por la función, así que no lo alcanza el
  // tope de 4,5 MB de Vercel. El FormData de abajo se conserva para no romper
  // a quien tenga la pestaña vieja abierta mientras se despliega.
  let subidos: SubidoDirecto[] = []

  if (esFormulario) {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ success: false, error: 'Formulario inválido' }, { status: 400 })
    crudo = {
      conversacion_id: form.get('conversacion_id'),
      contenido: (form.get('contenido') as string) || undefined,
      responder_a: (form.get('responder_a') as string) || undefined,
      hilo_padre: (form.get('hilo_padre') as string) || undefined,
    }
    archivos = form.getAll('archivos').filter((f): f is File => f instanceof File)
  } else {
    crudo = await req.json().catch(() => null)
    const lista = (crudo as { adjuntos?: unknown })?.adjuntos
    if (lista !== undefined) {
      const parsedAdj = SubidosSchema.safeParse(lista)
      if (!parsedAdj.success) {
        return NextResponse.json(
          { success: false, error: 'Adjuntos inválidos' },
          { status: 400 },
        )
      }
      subidos = parsedAdj.data
    }
  }

  const parsed = EnviarMensajeSchema.safeParse(crudo)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Mensaje inválido' },
      { status: 400 },
    )
  }

  const { conversacion_id, contenido, responder_a, hilo_padre } = parsed.data

  // Un mensaje sin texto ni archivo no es nada. El schema deja el texto opcional
  // porque solo acá se sabe si vino un adjunto.
  if (!contenido?.trim() && archivos.length === 0 && subidos.length === 0) {
    return NextResponse.json({ success: false, error: 'El mensaje está vacío' }, { status: 400 })
  }

  // La ruta la arma el servidor al firmar, pero vuelve por el navegador: se
  // revisa que siga colgando de ESTA conversación. Sin esto, alguien podría
  // registrar en su hilo un archivo que vive en la carpeta de otro.
  const intrusa = subidos.find((s) => !rutaPerteneceA(s.ruta, conversacion_id))
  if (intrusa) {
    return NextResponse.json(
      { success: false, error: 'Adjunto que no corresponde a esta conversación' },
      { status: 400 },
    )
  }

  const problema = validarArchivos(
    archivos.length > 0
      ? archivos.map((f) => ({ nombre: f.name, bytes: f.size }))
      : subidos.map((s) => ({ nombre: s.nombre, bytes: s.bytes })),
  )
  if (problema) return NextResponse.json({ success: false, error: problema }, { status: 400 })

  const repo = new ChatRepository(supabase)

  try {
    const mensaje = await repo.enviar(conversacion_id, perfil.id, contenido ?? null, {
      responder_a,
      hilo_padre,
    })

    if (subidos.length > 0) {
      mensaje.adjuntos = await registrarSubidos(mensaje.id, subidos)
    } else if (archivos.length > 0) {
      mensaje.adjuntos = await guardarAdjuntos(mensaje.id, conversacion_id, archivos)
    }

    // Aviso al resto: push al celular si lo tienen activado. Best-effort.
    const conversaciones = await repo.listConversaciones(perfil.id)
    const conv = conversaciones.find((c) => c.id === conversacion_id)
    const destinatarios = (conv?.miembros ?? [])
      .map((m) => m.integrante_id)
      .filter((id) => id !== perfil.id)

    if (destinatarios.length > 0) {
      // En cualquier hilo con nombre propio (grupo o canal de agentes) conviene
      // decir dónde se dijo; en un DM el nombre de quien escribe ya alcanza.
      const titulo =
        conv && conv.tipo !== 'dm' ? `${perfil.nombre} en ${conv.nombre}` : perfil.nombre
      const { enviarPush } = await import('@/lib/push/server')
      await enviarPush(destinatarios, {
        titulo,
        cuerpo: resumenPush(contenido, [
          ...archivos.map((f) => ({ nombre: f.name, tipo: f.type })),
          ...subidos.map((s) => ({ nombre: s.nombre, tipo: s.tipo_mime })),
        ]),
        link: `/chat?c=${conversacion_id}`,
        tag: `chat-${conversacion_id}`,
      })
    }

    return NextResponse.json({ success: true, data: mensaje })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Error enviando el mensaje' },
      { status: 500 },
    )
  }
}

// ── Adjuntos ───────────────────────────────────────────────────────────────

// Los límites y su validación viven en `lib/types/adjuntos.ts`: la pantalla usa
// la misma función, así el usuario se entera de que el archivo no entra ANTES
// de subirlo y no con un error al final.

/**
 * Registra archivos que el navegador ya dejó en Storage.
 *
 * Comprueba que cada objeto EXISTA antes de crear su fila: el navegador dice
 * que subió, y eso no alcanza. Si se firmó la URL pero la subida se cortó, sin
 * esta comprobación quedaría un adjunto en el chat que al abrirlo da 404 — un
 * mensaje que miente sobre lo que contiene.
 */
async function registrarSubidos(mensajeId: string, subidos: SubidoDirecto[]) {
  const { createAdminClient } = await import('@/lib/supabase/server')
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const guardados = []
  for (const s of subidos) {
    const carpeta = s.ruta.slice(0, s.ruta.lastIndexOf('/'))
    const archivo = s.ruta.slice(s.ruta.lastIndexOf('/') + 1)
    const { data: encontrados } = await admin.storage
      .from(BUCKET_ADJUNTOS)
      .list(carpeta, { search: archivo, limit: 1 })

    if (!encontrados?.length) {
      throw new Error(`"${s.nombre}" no llegó a subirse. Inténtalo de nuevo.`)
    }

    const { data, error } = await sb
      .from('mensaje_adjuntos')
      .insert({
        mensaje_id: mensajeId,
        ruta: s.ruta,
        nombre: s.nombre,
        tipo_mime: s.tipo_mime || 'application/octet-stream',
        bytes: s.bytes,
        ancho: s.ancho ?? null,
        alto: s.alto ?? null,
      })
      .select('id, nombre, tipo_mime, bytes, ancho, alto')
      .single()

    if (error) {
      // Sin fila nadie puede llegar al archivo: se borra en vez de dejarlo colgado.
      await admin.storage.from(BUCKET_ADJUNTOS).remove([s.ruta])
      throw new Error(error.message)
    }

    guardados.push(data)
  }

  return guardados
}

/**
 * Sube los archivos y los registra. Se hace después de crear el mensaje porque
 * la fila del adjunto necesita su id; si algo falla acá, el mensaje ya existe y
 * el error se ve — peor sería un archivo subido sin mensaje que lo reclame.
 */
async function guardarAdjuntos(mensajeId: string, conversacionId: string, archivos: File[]) {
  const { createAdminClient } = await import('@/lib/supabase/server')
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  const guardados = []
  for (const [i, file] of archivos.entries()) {
    // La ruta cuelga de la conversación: así se puede limpiar todo un hilo de una.
    const ruta = `${conversacionId}/${mensajeId}/${i}-${sanear(file.name)}`

    const { error } = await admin.storage
      .from('adjuntos-chat')
      .upload(ruta, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
    if (error) throw new Error(`No se pudo subir "${file.name}": ${error.message}`)

    const { data, error: errFila } = await sb
      .from('mensaje_adjuntos')
      .insert({
        mensaje_id: mensajeId,
        ruta,
        nombre: file.name,
        tipo_mime: file.type || 'application/octet-stream',
        bytes: file.size,
      })
      .select('id, nombre, tipo_mime, bytes, ancho, alto')
      .single()

    if (errFila) {
      // Sin fila nadie puede llegar al archivo: se borra en vez de dejarlo colgado.
      await admin.storage.from('adjuntos-chat').remove([ruta])
      throw new Error(errFila.message)
    }

    guardados.push(data)
  }

  return guardados
}

/** Nombre de archivo apto para una ruta de storage, sin perder la extensión. */
function sanear(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
}

/** Qué decir en la notificación cuando el mensaje es solo una foto. */
function resumenPush(
  contenido: string | undefined,
  adjuntos: { nombre: string; tipo: string }[],
): string {
  if (contenido?.trim()) return contenido.trim().slice(0, 140)
  if (adjuntos.length === 0) return 'Envió un mensaje'
  if (adjuntos.length === 1) {
    return adjuntos[0].tipo.startsWith('image/')
      ? 'Envió una imagen'
      : `Envió ${adjuntos[0].nombre}`
  }
  return `Envió ${adjuntos.length} archivos`
}
