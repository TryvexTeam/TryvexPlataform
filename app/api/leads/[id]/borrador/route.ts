import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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

  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Falta el texto' }, { status: 400 })
  }

  // Se borran los borradores anteriores de este lead antes de guardar el nuevo.
  // Si no, se acumulan y "el más reciente" depende del reloj: dos borradores
  // del mismo segundo dejarían cuál gana librado al azar.
  await (supabase as SB)
    .from('outreach_messages')
    .delete()
    .eq('lead_id', id)
    .eq('canal', 'whatsapp')
    .eq('estado', 'borrador')

  const { error } = await (supabase as SB).from('outreach_messages').insert({
    lead_id: id,
    canal: 'whatsapp',
    texto: parsed.data.texto,
    estado: 'borrador',
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

  const { id } = await params

  const { error } = await (supabase as SB)
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
