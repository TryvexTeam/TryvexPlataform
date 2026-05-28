import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { LeadsPipeline } from '@/components/leads/leads-pipeline'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new LeadsRepository(supabase)
  const leads = await repo.list()

  return (
    <div className="p-6">
      <LeadsPipeline initialLeads={leads} />
    </div>
  )
}
