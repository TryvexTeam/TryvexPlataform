import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { MensajeWa } from '@/lib/types/mensaje-wa'

/**
 * GET /api/leads/[id]/mensajes
 * Devuelve el hilo de WhatsApp del lead (tabla mensajes_wa), orden cronológico.
 * La tabla aún no está en los tipos generados, por eso se accede con un cliente
 * admin y un cast local. Cuando el Botón 2 (puente whatsapp-web.js) empiece a
 * poblar la tabla, este endpoint ya la sirve sin cambios.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  // Cast: mensajes_wa todavía no está en Database generado.
  const admin = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          col: string,
          val: string
        ) => {
          order: (
            col: string,
            opts: { ascending: boolean }
          ) => Promise<{ data: MensajeWa[] | null; error: unknown }>
        }
      }
    }
  }

  // `select('*')` en vez de columnas explícitas: así el endpoint es resiliente a
  // que `enviado_por` / `estado_envio` (migración 015) todavía no existan. Cuando
  // esa migración entre por el PR de la capa de datos, la atribución aparece sola
  // sin tocar este archivo.
  const { data, error } = await admin
    .from('mensajes_wa')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: 'No se pudo leer el hilo', detail: String(error) },
      { status: 500 }
    )
  }

  return NextResponse.json({ mensajes: data ?? [] })
}
