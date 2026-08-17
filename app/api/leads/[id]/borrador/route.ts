import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

/**
 * El borrador que Vex dejó listo para un lead.
 *
 * Es el puente entre las dos pantallas: Vex redacta en su chat, y el mensaje
 * tiene que aparecer escrito en el chat de ESE lead, que vive en otra vista.
 * En vez de arrastrar el texto por la URL (se rompe con saltos de línea, queda
 * en el historial del navegador y no sobrevive a recargar), se guarda.
 *
 * Se usa `outreach_messages` con `estado='borrador'`, que ya existe en el
 * constraint desde la migración 041 y hoy no usa nadie. Sin tabla nueva.
 *
 * Leer va con la sesión de quien llama (la RLS ya lo cubre: `outreach_select`
 * exige ser integrante). **Escribir va con la clave de servicio**, porque esa
 * tabla NO tiene política de INSERT y eso es deliberado: escribir ahí es lo que
 * termina mandándole un mensaje a un cliente, y no se hace desde el navegador.
 * La puerta la pone este endpoint —tener cuenta no basta, hay que ser
 * integrante activo—, igual que en `vex/whatsapp/send`. Agregarle una policy de
 * INSERT a la tabla habría sido abrir esa escritura a cualquiera con sesión.
 */

const bodySchema = z.object({ texto: z.string().min(1).max(4000) })

/** GET: el borrador vigente (el más reciente), o `null` si no hay. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('outreach_messages')
    .select('id, texto, created_at')
    .eq('lead_id', id)
    .eq('canal', 'whatsapp')
    .eq('estado', 'borrador')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo leer el borrador: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data: data?.[0] ?? null })
}

/** POST: guarda un borrador para este lead. No envía nada. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Falta el texto' }, { status: 400 })
  }

  const admin = createAdminClient() as SB

  // Se borran los borradores anteriores de este lead antes de guardar el nuevo.
  // Si no, se acumulan y "el más reciente" depende del reloj: dos borradores
  // del mismo segundo dejarían cuál gana librado al azar.
  await admin
    .from('outreach_messages')
    .delete()
    .eq('lead_id', id)
    .eq('canal', 'whatsapp')
    .eq('estado', 'borrador')

  const { error } = await admin.from('outreach_messages').insert({
    lead_id: id,
    canal: 'whatsapp',
    texto: parsed.data.texto,
    estado: 'borrador',
    // Queda registrado quién lo dejó listo: el borrador es de una persona, no
    // de "el sistema".
    aprobado_por: perfil.id,
  })

  if (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo guardar el borrador: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

/** DELETE: descarta el borrador (se llama cuando se envía o se limpia). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  const { id } = await params

  const { error } = await (createAdminClient() as SB)
    .from('outreach_messages')
    .delete()
    .eq('lead_id', id)
    .eq('canal', 'whatsapp')
    .eq('estado', 'borrador')

  if (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo descartar el borrador: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
