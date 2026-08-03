import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { ChatRepository } from '@/lib/repos/chat'
import { CrearConversacionSchema } from '@/lib/types/chat'

/** Bandeja del integrante autenticado. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const conversaciones = await new ChatRepository(supabase).listConversaciones(perfil.id)
  return NextResponse.json({ success: true, data: conversaciones })
}

/** Abre un DM (o devuelve el existente) o crea un grupo. */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })

  const parsed = CrearConversacionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    )
  }

  const repo = new ChatRepository(supabase)
  try {
    const { tipo, nombre, miembros } = parsed.data
    const id =
      tipo === 'dm'
        ? await repo.abrirDm(perfil.id, miembros[0])
        : await repo.crearGrupo(perfil.id, nombre!, miembros)

    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    const clave = err instanceof Error ? err.message : ''
    if (clave === 'no_dm_conmigo_mismo') {
      return NextResponse.json({ success: false, error: 'No puedes abrir un chat contigo mismo' }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: clave || 'Error creando la conversación' }, { status: 500 })
  }
}
