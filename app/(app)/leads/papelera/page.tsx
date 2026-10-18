import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LeadsRepository } from '@/lib/repos/leads'
import { PapeleraLeads } from '@/components/leads/papelera-leads'

/**
 * Papelera de leads.
 *
 * Existe porque sin pantalla la papelera no sirve de nada: un lead marcado
 * `eliminado_at` sin lugar donde verlo queda tan invisible como uno borrado, y
 * el problema que se quería arreglar seguiría igual.
 */
export default async function PapeleraLeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const leads = await new LeadsRepository(supabase).listPapelera()

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Papelera de leads</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length === 0
              ? 'No hay leads en la papelera.'
              : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'} fuera del tablero. Conservan ficha, historial y conversación.`}
          </p>
        </div>
        <Link href="/leads" className="text-sm underline underline-offset-4">
          ← Volver a leads
        </Link>
      </div>

      <PapeleraLeads leads={leads} />
    </div>
  )
}
