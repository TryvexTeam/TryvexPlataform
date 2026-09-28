import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { AnotarSchema, HistorialManualRepository } from '@/lib/repos/historial-manual'

/**
 * /api/leads/[id]/historial — la conversación con el lead anotada a mano.
 *
 *   GET     el historial, en orden cronológico
 *   POST    anota uno o varios mensajes ({...} o [{...}, ...])
 *   DELETE  ?entrada=<id> borra uno (para corregir lo anotado mal)
 *
 * Quién lo anotó sale de la sesión, nunca del cuerpo: si viniera del cliente,
 * cualquiera podría anotar a nombre de otro.
 */

const IdSchema = z.string().uuid()

async function integrante() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 }) }
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return { error: NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 }) }
  return { supabase, perfil }
}

async function leadId(params: Promise<{ id: string }>) {
  const { id } = await params
  return IdSchema.safeParse(id).success ? id : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const quien = await integrante()
  if ('error' in quien) return quien.error
  const id = await leadId(params)
  if (!id) return NextResponse.json({ success: false, error: 'Lead inválido' }, { status: 400 })
  try {
    const data = await new HistorialManualRepository(quien.supabase).listar(id)
    return NextResponse.json({ success: true, data })
  } catch (e) {
    console.error('[historial-manual] GET', e)
    return NextResponse.json({ success: false, error: 'No se pudo leer el historial' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const quien = await integrante()
  if ('error' in quien) return quien.error
  const id = await leadId(params)
  if (!id) return NextResponse.json({ success: false, error: 'Lead inválido' }, { status: 400 })

  const parsed = AnotarSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const motivo = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ success: false, error: motivo }, { status: 400 })
  }
  try {
    const anotados = await new HistorialManualRepository(quien.supabase).anotar(id, quien.perfil.id, parsed.data)
    return NextResponse.json({ success: true, data: { anotados } }, { status: 201 })
  } catch (e) {
    console.error('[historial-manual] POST', e)
    return NextResponse.json({ success: false, error: 'No se pudo guardar en el historial' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const quien = await integrante()
  if ('error' in quien) return quien.error
  const id = await leadId(params)
  const entrada = new URL(req.url).searchParams.get('entrada')
  if (!id || !entrada || !IdSchema.safeParse(entrada).success) {
    return NextResponse.json({ success: false, error: 'Falta qué borrar' }, { status: 400 })
  }
  try {
    const borrado = await new HistorialManualRepository(quien.supabase).borrar(id, entrada)
    if (!borrado) return NextResponse.json({ success: false, error: 'Ese mensaje ya no está' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[historial-manual] DELETE', e)
    return NextResponse.json({ success: false, error: 'No se pudo borrar' }, { status: 500 })
  }
}
