import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/wa/leido  { lead_id }
 *
 * Marca el hilo de WhatsApp de ese lead como leido hasta ahora. Lo llama el
 * chat al abrirse y cada vez que trae mensajes nuevos con la pantalla a la
 * vista: si el chat esta abierto, el mensaje esta siendo leido.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  let lead_id: unknown
  try {
    ;({ lead_id } = await req.json())
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo invalido' }, { status: 400 })
  }

  if (typeof lead_id !== 'string' || !lead_id) {
    return NextResponse.json({ success: false, error: 'Falta lead_id' }, { status: 400 })
  }

  // `as any` como en lib/repos/tareas.ts: los tipos generados de Supabase
  // colapsan el argumento de .update() a `never` en estas tablas. La columna
  // existe (migracion 046) y el tipo esta en database.ts; es el generico del
  // cliente el que no lo resuelve.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('fact_leads')
    .update({ wa_leido_hasta: new Date().toISOString() })
    .eq('id', lead_id)

  if (error) {
    return NextResponse.json(
      { success: false, error: `No se pudo marcar como leido: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
