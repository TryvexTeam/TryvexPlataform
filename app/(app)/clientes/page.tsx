import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientesRepository } from '@/lib/repos/clientes'
import { ClientesLista } from '@/components/clientes/clientes-lista'

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const repo = new ClientesRepository(supabase)
  const clientes = await repo.list()

  return (
    <div className="p-6">
      <ClientesLista initialClientes={clientes} />
    </div>
  )
}
