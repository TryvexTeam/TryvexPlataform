import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { JornadasRepository } from '@/lib/repos/jornadas'
import { PermisosRepository, puede } from '@/lib/repos/permisos'
import { RelojJornada } from '@/components/jornada/reloj-jornada'
import { TablaJornadas } from '@/components/jornada/tabla-jornadas'
import type { JornadaResumen } from '@/lib/types/jornada'

export const dynamic = 'force-dynamic'

/** Inicio del mes actual en hora de Santiago, expresado en ISO. */
function rangoMesActual(): { desde: string; hasta: string } {
  const ahora = new Date()
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1))
  const hasta = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1))
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

function totalHoras(filas: JornadaResumen[]): number {
  return filas.reduce((acc, f) => acc + Number(f.horas ?? 0), 0)
}

export default async function JornadaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id)
  if (!perfil) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)]">Jornada</h1>
        <p className="text-[var(--tx-ink-muted)] mt-1">No eres integrante activo. Contacta al administrador.</p>
      </div>
    )
  }

  const repo = new JornadasRepository(supabase)
  const { desde, hasta } = rangoMesActual()

  // La sección "Equipo" ya no depende de es_admin sino del permiso suelto: el dueño
  // puede dar visibilidad de la jornada del equipo sin convertir a nadie en admin
  // de todo lo demás.
  const perfilPermisos = await new PermisosRepository(supabase).misPermisos(user.id)
  const veEquipo = puede(perfilPermisos, 'ver_jornadas_equipo')

  const [abierta, propias, equipo] = await Promise.all([
    repo.getAbierta(perfil.id),
    repo.listPropias(perfil.id, desde, hasta),
    veEquipo ? repo.listEquipo(desde, hasta) : Promise.resolve([]),
  ])

  return (
    // pb-10 extra (mas alla de lo que ya reserva pb-nav-movil): sin esto la
    // ultima fila de la lista quedaba unos px por debajo del alto visible de
    // `main` incluso en el scroll maximo -- inalcanzable de verdad, no una
    // sensacion. Reportado por Vicho probando en el celular.
    <div className="p-6 pb-20 space-y-10">
      <header>
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Jornada</h1>
        <p className="text-[var(--tx-ink-muted)]">Marca tu entrada y tu salida. Las pausas se descuentan del total.</p>
      </header>

      <RelojJornada jornadaInicial={abierta} />

      <SeccionJornadas
        titulo="Este mes"
        totalHoras={totalHoras(propias)}
        etiquetaTotal="acumuladas"
      >
        <TablaJornadas filas={propias} mostrarPersona={false} />
      </SeccionJornadas>

      {veEquipo && (
        <SeccionJornadas
          titulo="Equipo"
          subtitulo="este mes"
          totalHoras={totalHoras(equipo)}
          etiquetaTotal="en total"
        >
          <TablaJornadas filas={equipo} mostrarPersona />
        </SeccionJornadas>
      )}
    </div>
  )
}

function SeccionJornadas({
  titulo,
  subtitulo,
  totalHoras,
  etiquetaTotal,
  children,
}: {
  titulo: string
  subtitulo?: string
  totalHoras: number
  etiquetaTotal: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="flex items-baseline gap-1.5 text-[15px] font-semibold text-[var(--tx-ink-primary)]">
          {titulo}
          {subtitulo && (
            <span className="text-[13px] font-normal text-[var(--tx-ink-muted)]">{subtitulo}</span>
          )}
        </h2>
        <span
          className="text-[12px] font-semibold tabular-nums px-2.5 py-1 rounded-full"
          style={{ background: 'var(--tx-accent-subtle)', color: 'var(--tx-ink-primary)' }}
        >
          {totalHoras.toFixed(1)} h {etiquetaTotal}
        </span>
      </div>
      {children}
    </section>
  )
}
