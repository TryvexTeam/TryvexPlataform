import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que sea integrante activo
  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!integrante) redirect('/dashboard')

  return <>{children}</>
}
