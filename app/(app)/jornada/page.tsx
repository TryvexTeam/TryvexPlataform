import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { JornadasRepository } from '@/lib/repos/jornadas'
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
        <p className="text-neutral-500 mt-1">No eres integrante activo. Contacta al administrador.</p>
      </div>
    )
  }

  const repo = new JornadasRepository(supabase)
  const { desde, hasta } = rangoMesActual()

  const [abierta, propias, equipo] = await Promise.all([
    repo.getAbierta(perfil.id),
    repo.listPropias(perfil.id, desde, hasta),
    perfil.es_admin ? repo.listEquipo(desde, hasta) : Promise.resolve([]),
  ])

  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-[var(--tx-ink-primary)] mb-1">Jornada</h1>
        <p className="text-neutral-500">Marca tu entrada y tu salida. Las pausas se descuentan del total.</p>
      </header>

      <section className="rounded-xl border border-neutral-200 p-5">
        <RelojJornada jornadaInicial={abierta} />
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-neutral-800">Este mes</h2>
          <span className="text-sm text-neutral-500 tabular-nums">
            {totalHoras(propias).toFixed(1)} h acumuladas
          </span>
        </div>
        <TablaJornadas filas={propias} mostrarPersona={false} />
      </section>

      {perfil.es_admin && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-neutral-800">Equipo — este mes</h2>
            <span className="text-sm text-neutral-500 tabular-nums">
              {totalHoras(equipo).toFixed(1)} h en total
            </span>
          </div>
          <TablaJornadas filas={equipo} mostrarPersona />
        </section>
      )}
    </div>
  )
}
