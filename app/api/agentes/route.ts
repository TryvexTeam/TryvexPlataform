import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { generarToken, hashToken } from '@/lib/agentes/token'

/** Alta y listado de agentes. Crear uno reparte una llave: solo admin. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  // El token nunca sale de la base: lo guardado es su hash y ni siquiera se pide.
  const { data, error } = await (supabase as SB)
    .from('agentes')
    .select('id, nombre, descripcion, color, avatar_url, activo, ultimo_uso_at, created_at')
    .order('nombre')

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  if (!perfil.es_admin) {
    return NextResponse.json({ success: false, error: 'Solo un admin puede dar de alta agentes' }, { status: 403 })
  }

  const cuerpo = (await req.json().catch(() => null)) as
    | { nombre?: string; descripcion?: string; color?: string }
    | null

  const nombre = cuerpo?.nombre?.trim()
  if (!nombre) return NextResponse.json({ success: false, error: 'Falta el nombre' }, { status: 400 })

  const token = generarToken()

  const { data, error } = await (createAdminClient() as SB)
    .from('agentes')
    .insert({
      nombre,
      descripcion: cuerpo?.descripcion?.trim() || null,
      color: cuerpo?.color ?? null,
      token_hash: hashToken(token),
      creado_por: perfil.id,
    })
    .select('id, nombre')
    .single()

  if (error) {
    const duplicado = error.message.includes('duplicate') || error.code === '23505'
    return NextResponse.json(
      { success: false, error: duplicado ? 'Ya existe un agente con ese nombre' : error.message },
      { status: duplicado ? 409 : 500 },
    )
  }

  // La única vez que el token viaja legible. Después ya no se puede recuperar:
  // si se pierde, se da de baja el agente y se crea otro.
  return NextResponse.json({ success: true, data: { ...data, token } })
}
