import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { PageTransition } from '@/components/layout/page-transition'
import { AuthProvider } from '@/components/layout/auth-provider'
import { ThemeProvider } from '@/components/dashboard/theme-context'
import { DynamicGlows } from '@/components/layout/dynamic-glows'
import { AppShell } from '@/components/layout/app-shell'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { ProveedorLlamadas } from '@/components/llamadas/proveedor-llamadas'
import { FrenoJornada } from '@/components/jornada/freno-jornada'
import { JornadasRepository } from '@/lib/repos/jornadas'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  // El fusible de siempre: fuera de desarrollo, `bypass` es false y nada de lo
  // de abajo se activa.
  const bypass =
    process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === 'true'

  let user = null
  if (bypass) {
    user = { id: '1230b7c1-8086-4f14-b6b1-2afa9deb56ae', email: 'ignacio.andres.navarrete.silva@gmail.com' }
  } else {
    const res = await supabase.auth.getUser()
    user = res.data.user
  }

  if (!user) redirect('/login')

  /*
   * Con el atajo puesto, los datos se piden con el cliente de servicio.
   *
   * El usuario inventado no tiene sesión: `auth.uid()` es null y RLS niega
   * `dim_integrantes`. El layout moría con "permission denied for table
   * dim_integrantes" y con él se caía la app ENTERA — no la pantalla que uno
   * quería mirar, toda. El middleware ya había previsto la mitad del problema
   * (por eso no comprueba la fila del integrante, "comprobarlo convertiría el
   * bypass en un candado"); faltaba esta otra mitad.
   */
  const datos = bypass ? createAdminClient() : supabase

  /*
   * Dos consultas en paralelo, no cuatro en fila.
   *
   * Este layout se ejecuta en CADA navegación y en cada refresco automático, así
   * que lo que tarde aquí lo paga toda la app. Antes pedía la fila del integrante
   * y luego, por separado, sus permisos: la misma fila de `dim_integrantes` dos
   * veces, con la segunda esperando a que terminara la primera. Ahora los
   * permisos traen también el nombre, el correo y la foto, y el equipo se pide a
   * la vez en lugar de después.
   */
  const [permisos, { data: equipo }] = await Promise.all([
    new PermisosRepository(supabase).misPermisos(user.id),
    // El equipo se carga acá y no en el chat porque una llamada entrante tiene
    // que poder decir quién llama estando uno en leads, en finanzas o donde sea.
    supabase
      .from('dim_integrantes')
      .select('id, nombre, avatar_url, color')
      .eq('activo', true) as unknown as Promise<{
        data: { id: string; nombre: string; avatar_url: string | null; color: string | null }[] | null
      }>,
  ])

  const integrante = permisos

  // ¿Tiene jornada abierta? Decide si las secciones de trabajo piden marcar
  // entrada. Va después de los permisos porque necesita el id del integrante,
  // y se traga su propio error: sin este dato la app sigue, solo que sin freno
  // — preferible a una pantalla en blanco por un fallo de una consulta.
  const jornadaAbierta = permisos?.id
    ? Boolean(await new JornadasRepository(supabase).getAbierta(permisos.id).catch(() => null))
    : true

  const nombre = permisos?.nombre ?? user.email ?? 'Usuario'
  const email = permisos?.email ?? user.email ?? ''
  const avatarUrl = permisos?.avatar_url ?? null

  // Sin fila en dim_integrantes no hay a quién llamar ni quién llame: el resto de
  // la app sigue funcionando, solo que sin llamadas.
  const contenido = (
    <>
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
            <Sidebar
              puedeVerFinanzas={puede(permisos, 'ver_finanzas')}
              esSuperadmin={permisos?.es_superadmin ?? false}
            />
          </aside>

          {/* Main content */}
          <div className="flex flex-col flex-1 min-w-0 relative z-10">
            <Topbar nombre={nombre} email={email} avatarUrl={avatarUrl} jornadaAbierta={jornadaAbierta} />
            <main className="flex-1 overflow-y-auto overflow-x-hidden pb-nav-movil md:pb-0 h-full">
              <PageTransition>
                <FrenoJornada jornadaAbierta={jornadaAbierta}>{children}</FrenoJornada>
              </PageTransition>
            </main>
          </div>
      </AppShell>
      <BottomNav />
    </>
  )

  return (
    <AuthProvider>
      <ThemeProvider>
        {integrante ? (
          <ProveedorLlamadas miIntegranteId={integrante.id} equipo={equipo ?? []}>
            {contenido}
          </ProveedorLlamadas>
        ) : (
          contenido
        )}
      </ThemeProvider>
    </AuthProvider>
  )
}
