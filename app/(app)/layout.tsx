import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: integrante } = await supabase
    .from('dim_integrantes')
    .select('nombre, email, avatar_url')
    .eq('auth_user_id', user.id)
    .single() as { data: { nombre: string; email: string; avatar_url: string | null } | null; error: unknown }

  const nombre = integrante?.nombre ?? user.email ?? 'Usuario'
  const email = integrante?.email ?? user.email ?? ''
  const avatarUrl = integrante?.avatar_url ?? null

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex shrink-0">
        <Sidebar />
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar nombre={nombre} email={email} avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
