import Link from 'next/link'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Bot, CheckSquare, Flame, FolderKanban, Globe, Link2, Mail, Trophy, UserRound } from 'lucide-react'
import { AvatarIntegrante } from '@/components/shared/avatar-integrante'
import { CalendarioActividad } from './calendario-actividad'
import type { MovimientoIntegrante, PerfilIntegrante } from '@/lib/types/perfil-integrante'
import { cn } from '@/lib/utils'

/**
 * El perfil de un integrante, abierto desde cualquier foto o nombre del CRM.
 *
 * Todo el equipo ve lo mismo (decisión de Cristian, 18-oct): solo trabajo de
 * Tryvex. Un número que no se pudo contar dice "falta", nunca 0.
 */

function Numero({ etiqueta, valor, sufijo }: { etiqueta: string; valor: number | null; sufijo?: string }) {
  return (
    <div className="rounded-xl bg-[var(--tx-surface-2)] p-4">
      <p className="text-xs text-[var(--tx-ink-muted)]">{etiqueta}</p>
      {valor === null ? (
        <p className="mt-1 text-sm text-[var(--tx-warning)]" title="No se pudo leer este dato">
          Falta el dato
        </p>
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--tx-ink-primary)]">
          {valor.toLocaleString('es-CL')}
          {sufijo && <span className="ml-1 text-sm font-normal text-[var(--tx-ink-secondary)]">{sufijo}</span>}
        </p>
      )}
    </div>
  )
}

const ICONO_MOVIMIENTO: Record<MovimientoIntegrante['tipo'], typeof UserRound> = {
  lead: UserRound,
  tarea: CheckSquare,
  cliente: Trophy,
  proyecto: FolderKanban,
}

/** Rol y especialidad, sin repetir cuando la persona escribió lo mismo en los dos. */
function rolYEspecialidad(rol: string | null, especialidad: string | null): string {
  const clave = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñ0-9]/g, '')
  const partes = [rol, especialidad].filter((s): s is string => Boolean(s?.trim()))
  if (partes.length === 2 && clave(partes[0]) === clave(partes[1])) partes.pop()
  return partes.join(' · ')
}

function Faltante({ texto }: { texto: string }) {
  return <p className="text-sm text-[var(--tx-ink-muted)]">{texto}</p>
}

export function PerfilIntegranteVista({ perfil, esPropio }: { perfil: PerfilIntegrante; esPropio: boolean }) {
  const { datos, numeros } = perfil
  const faltanDatos = !datos.rol || !datos.bio

  return (
    <div className="flex flex-col gap-6">
      <Link href="/hoy" className="flex w-fit items-center gap-1.5 text-sm text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]">
        <ArrowLeft size={14} /> Volver
      </Link>

      {/* Cabecera */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AvatarIntegrante nombre={datos.nombre} avatarUrl={datos.avatarUrl} color={datos.color} size={88} destacado={esPropio} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-[var(--tx-ink-primary)]">{datos.nombre}</h1>
          <p className="text-sm text-[var(--tx-ink-secondary)]">
            {rolYEspecialidad(datos.rol, datos.especialidad) || 'Sin rol escrito'}
          </p>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            En Tryvex desde {format(new Date(datos.desde), "MMMM 'de' yyyy", { locale: es })}
            {!datos.activo && ' · ya no está activo'}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--tx-ink-secondary)]">
            <a href={`mailto:${datos.email}`} className="flex items-center gap-1 hover:text-[var(--tx-ink-primary)]">
              <Mail size={12} /> {datos.email}
            </a>
            {datos.linkedin && (
              <a href={datos.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-[var(--tx-ink-primary)]">
                <Link2 size={12} /> LinkedIn
              </a>
            )}
            {datos.portfolio && (
              <a href={datos.portfolio} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-[var(--tx-ink-primary)]">
                <Globe size={12} /> Portafolio
              </a>
            )}
          </div>
        </div>
        {perfil.racha > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-[var(--tx-surface-2)] px-4 py-3" title="Días seguidos con actividad">
            <Flame size={18} className="text-[var(--tx-orange)]" />
            <div>
              <p className="text-lg font-semibold tabular-nums text-[var(--tx-ink-primary)]">{perfil.racha}</p>
              <p className="text-[11px] text-[var(--tx-ink-muted)]">día{perfil.racha === 1 ? '' : 's'} seguidos</p>
            </div>
          </div>
        )}
      </header>

      {datos.bio && <p className="max-w-3xl text-sm text-[var(--tx-ink-secondary)]">{datos.bio}</p>}
      {faltanDatos && (
        <p className="w-fit rounded-lg border border-dashed border-[var(--tx-border)] px-3 py-2 text-xs text-[var(--tx-ink-muted)]">
          {esPropio ? (
            <>
              Te falta completar tu {!datos.rol ? 'rol' : 'presentación'}.{' '}
              <Link href="/settings" className="text-[var(--tx-accent-2)] underline">
                Completar en Configuración
              </Link>
            </>
          ) : (
            `${datos.nombre} todavía no completa su ${!datos.rol ? 'rol' : 'presentación'}.`
          )}
        </p>
      )}

      {/* Números */}
      <section aria-label="Números" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Numero etiqueta="Horas trabajadas (12 meses)" valor={numeros.horas} sufijo="h" />
        <Numero etiqueta="Leads contactados" valor={numeros.leadsContactados} />
        <Numero etiqueta="Clientes ganados" valor={numeros.clientesGanados} />
        <Numero etiqueta="Tareas completadas" valor={numeros.tareasCompletadas} />
        <Numero etiqueta="Proyectos" valor={numeros.proyectos} />
      </section>

      {/* Calendario */}
      <section className="rounded-xl border border-[var(--tx-border)] p-4">
        <CalendarioActividad dias={perfil.calendario} />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Actividad reciente */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--tx-ink-secondary)]">Actividad reciente</h2>
          {perfil.recientes.length === 0 ? (
            <Faltante texto="Todavía no hay actividad registrada." />
          ) : (
            <ol className="flex flex-col">
              {perfil.recientes.map((m, i) => {
                const Icono = ICONO_MOVIMIENTO[m.tipo]
                const contenido = (
                  <>
                    <Icono size={14} className="mt-0.5 shrink-0 text-[var(--tx-ink-muted)]" />
                    <span className="min-w-0 flex-1 text-sm text-[var(--tx-ink-primary)]">{m.texto}</span>
                    <time dateTime={m.fecha} className="shrink-0 text-xs text-[var(--tx-ink-muted)]">
                      {formatDistanceToNowStrict(new Date(m.fecha), { locale: es, addSuffix: true })}
                    </time>
                  </>
                )
                return (
                  <li key={`${m.tipo}-${i}`} className="border-b border-[var(--tx-border)] last:border-0">
                    {m.href ? (
                      <Link href={m.href} className="flex items-start gap-2.5 py-2.5 hover:bg-[var(--tx-surface-1)]">
                        {contenido}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-2.5 py-2.5">{contenido}</div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          {/* Asistente */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--tx-ink-secondary)]">
              {(perfil.asistentes?.length ?? 0) > 1 ? 'Sus asistentes de IA' : 'Su asistente de IA'}
            </h2>
            {perfil.asistentes === null ? (
              <p className="text-sm text-[var(--tx-warning)]">Falta el dato: no se pudo leer su asistente.</p>
            ) : perfil.asistentes.length === 0 ? (
              <Faltante texto="No tiene un asistente de IA conectado al CRM." />
            ) : (
              perfil.asistentes.map((a) => (
                <div key={a.id} className="rounded-xl bg-[var(--tx-surface-2)] p-4">
                  <div className="flex items-center gap-2">
                    <Bot size={16} style={{ color: a.color ?? 'var(--tx-accent-2)' }} />
                    <p className="font-semibold text-[var(--tx-ink-primary)]">{a.nombre}</p>
                    <span
                      className={cn(
                        'ml-auto rounded-full px-2 py-0.5 text-[11px]',
                        a.activo ? 'bg-green-500/15 text-green-500' : 'bg-[var(--tx-surface-1)] text-[var(--tx-ink-muted)]',
                      )}
                    >
                      {a.activo ? 'activo' : 'apagado'}
                    </span>
                  </div>
                  {a.descripcion && <p className="mt-1 text-xs text-[var(--tx-ink-secondary)]">{a.descripcion}</p>}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-[var(--tx-ink-muted)]">Encargos hechos</dt>
                      <dd className="font-semibold tabular-nums text-[var(--tx-ink-primary)]">{a.encargosRespondidos}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--tx-ink-muted)]">En cola</dt>
                      <dd className="font-semibold tabular-nums text-[var(--tx-ink-primary)]">{a.encargosAbiertos}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-[var(--tx-ink-muted)]">Última señal</dt>
                      <dd className="text-[var(--tx-ink-primary)]">
                        {a.ultimoUsoAt
                          ? formatDistanceToNowStrict(new Date(a.ultimoUsoAt), { locale: es, addSuffix: true })
                          : 'nunca se conectó'}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))
            )}
          </section>

          {/* Proyectos */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--tx-ink-secondary)]">Proyectos</h2>
            {perfil.proyectos.length === 0 ? (
              <Faltante texto="No está en ningún proyecto." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {perfil.proyectos.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/proyectos/${p.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--tx-surface-1)]"
                    >
                      <span className="truncate text-[var(--tx-ink-primary)]">{p.nombre}</span>
                      <span className="shrink-0 text-xs text-[var(--tx-ink-muted)]">
                        {p.esResponsable ? 'responsable · ' : ''}
                        {p.estado}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
