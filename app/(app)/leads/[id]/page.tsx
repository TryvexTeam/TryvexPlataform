import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { LeadDetalle } from '@/components/leads/lead-detalle'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new LeadsRepository(supabase)
  const [lead, interacciones] = await Promise.all([
    repo.getById(id),
    repo.listInteracciones(id),
  ])

  if (!lead) notFound()

  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('id')
    .eq('auth_user_id', user.id)
    .single() as { data: { id: string } | null; error: unknown }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <LeadDetalle
        lead={lead}
        initialInteracciones={interacciones}
        integranteId={integrante?.id ?? null}
      />
    </div>
  )
}
