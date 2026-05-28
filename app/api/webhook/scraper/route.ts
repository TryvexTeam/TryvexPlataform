import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'

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
  if (!secret || secret !== process.env.SCRAPER_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const result = PayloadSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues }, { status: 400 })
  }

  const supabase = await createClient()
  const repo = new LeadsRepository(supabase)

  const leadsParaInsertar = result.data.leads.map((l) => ({
    ...l,
    origen: 'scraper' as const,
    estado: 'sin_contactar' as const,
  }))

  const { inserted, errors } = await repo.insertarMuchos(leadsParaInsertar)

  return NextResponse.json({ inserted, errors }, { status: 200 })
}
