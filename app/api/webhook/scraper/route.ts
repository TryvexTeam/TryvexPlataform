import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { LeadsRepository } from '@/lib/repos/leads'

/**
 * Compara el secret recibido contra el esperado sin filtrar por timing.
 * `===` corta en el primer byte distinto, lo que deja medir por cuánto
 * tiempo tarda la respuesta cuántos caracteres iniciales acertó un atacante.
 * `timingSafeEqual` explota si los buffers tienen largo distinto, así que
 * ese caso se descarta antes sin comparar.
 */
function secretValido(recibido: string | null): boolean {
  const esperado = process.env.SCRAPER_WEBHOOK_SECRET
  if (!recibido || !esperado) return false
  const bufRecibido = Buffer.from(recibido)
  const bufEsperado = Buffer.from(esperado)
  if (bufRecibido.length !== bufEsperado.length) return false
  return timingSafeEqual(bufRecibido, bufEsperado)
}

const LeadScraperSchema = z.object({
  nombre_negocio: z.string().min(1),
  telefono: z.string().nullable().optional(),
  info_texto: z.string().nullable().optional(),
  redes_sociales: z.record(z.string(), z.string()).nullable().optional(),
  tiene_web: z.boolean().optional(),
  url_web: z.string().nullable().optional(),
  nicho: z.string().nullable().optional(),
  localidad: z.string().nullable().optional(),
  score: z.number().min(1).max(10).nullable().optional(),
  notas: z.string().nullable().optional(),
})

const PayloadSchema = z.object({
  leads: z.array(LeadScraperSchema).min(1).max(500),
})

export async function POST(req: Request) {
  const secret = req.headers.get('x-webhook-secret')
  if (!secretValido(secret)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const result = PayloadSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  // Webhook usa service role key — no necesita sesión de usuario
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const repo = new LeadsRepository(supabase as any)

  const leadsParaInsertar = result.data.leads.map((l) => ({
    ...l,
    origen: 'scraper' as const,
    estado: 'sin_contactar' as const,
  }))

  const { inserted, errors } = await repo.insertarMuchos(leadsParaInsertar)

  return NextResponse.json({ inserted, errors }, { status: 200 })
}
