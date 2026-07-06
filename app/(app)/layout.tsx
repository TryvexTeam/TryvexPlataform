import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { PageTransition } from '@/components/layout/page-transition'
import { AuthProvider } from '@/components/layout/auth-provider'
import { ThemeProvider } from '@/components/dashboard/theme-context'
import { DynamicGlows } from '@/components/layout/dynamic-glows'
import { AppShell } from '@/components/layout/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  let user = null
  if (process.env.BYPASS_AUTH === 'true') {
    user = { id: '1230b7c1-8086-4f14-b6b1-2afa9deb56ae', email: 'ignacio.andres.navarrete.silva@gmail.com' }
  } else {
    const res = await supabase.auth.getUser()
    user = res.data.user
  }

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
    <AuthProvider>
      <ThemeProvider>
        <AppShell>
          {/* Dynamic atmospheric glows */}
          <DynamicGlows />
          {/* Grain texture — opacity controlled by --tx-grain-opacity */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-overlay"
            style={{
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.5'/></svg>\")",
              opacity: 'var(--tx-grain-opacity, 0.035)',
              zIndex: 1,
              transition: 'opacity 400ms ease',
            }}
          />

          {/* Sidebar desktop */}
          <aside className="hidden md:flex shrink-0 relative z-10">
            <Sidebar />
          </aside>

          {/* Main content */}
          <div className="flex flex-col flex-1 min-w-0 relative z-10">
            <Topbar nombre={nombre} email={email} avatarUrl={avatarUrl} />
            <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0 h-full">
              <PageTransition>{children}</PageTransition>
            </main>
          </div>
        </AppShell>
        <BottomNav />
      </ThemeProvider>
    </AuthProvider>
  )
}
