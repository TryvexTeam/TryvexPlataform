'use client'

import { useMemo, useState } from 'react'
import { SearchIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import {
  ENTIDAD_LABEL,
  FUENTES,
  FUENTE_COLOR,
  FUENTE_LABEL,
  agruparPorDia,
  type EntradaCerebro,
  type FuenteEntrada,
} from '@/lib/types/cerebro'
import { Markdown } from '@/components/shared/markdown'
import { NuevaNota } from './nueva-nota'

interface EntidadActiva {
  entidad_tipo: string
  entidad_id: string
  entidad_nombre: string
  total: number
}

interface BitacoraProps {
  entradasIniciales: EntradaCerebro[]
  entidades: EntidadActiva[]
}

const DIA_LARGO = new Intl.DateTimeFormat('es-CL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Santiago',
})

const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

export function Bitacora({ entradasIniciales, entidades }: BitacoraProps) {
  const [entradas, setEntradas] = useState(entradasIniciales)
  const [buscar, setBuscar] = useState('')
  const [fuente, setFuente] = useState<FuenteEntrada | null>(null)
  const [entidad, setEntidad] = useState<EntidadActiva | null>(null)
  const [cargando, setCargando] = useState(false)

  const dias = useMemo(() => agruparPorDia(entradas), [entradas])

  const consultar = async (cambios: {
    buscar?: string
    fuente?: FuenteEntrada | null
    entidad?: EntidadActiva | null
  }) => {
    const q = cambios.buscar ?? buscar
    const f = cambios.fuente !== undefined ? cambios.fuente : fuente
    const e = cambios.entidad !== undefined ? cambios.entidad : entidad

    const params = new URLSearchParams()
    if (q.trim().length >= 2) params.set('buscar', q.trim())
    if (f) params.set('fuente', f)
    if (e) {
      params.set('entidad_tipo', e.entidad_tipo)
      params.set('entidad_id', e.entidad_id)
    }

    setCargando(true)
    try {
      const res = await fetch(`/api/cerebro?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo consultar')
      setEntradas(json.data as EntradaCerebro[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error consultando la bitácora')
    } finally {
      setCargando(false)
    }
  }

  const elegirFuente = (f: FuenteEntrada | null) => {
    setFuente(f)
    consultar({ fuente: f })
  }

  const elegirEntidad = (e: EntidadActiva | null) => {
    setEntidad(e)
    consultar({ entidad: e })
  }

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* Entidades con movimiento */}
      <aside className="w-[230px] shrink-0 hidden lg:flex flex-col min-h-0">
        <h2 className="text-[13px] font-semibold text-[var(--tx-ink-primary)] mb-2">Con movimiento</h2>
        <button
          onClick={() => elegirEntidad(null)}
          className="text-left text-[13px] px-2.5 py-1.5 rounded-lg mb-1"
          style={{ background: entidad ? 'transparent' : 'var(--tx-accent-subtle)' }}
        >
          Todo el negocio
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          {entidades.map((e) => {
            const activa = entidad?.entidad_id === e.entidad_id
            return (
              <button
                key={`${e.entidad_tipo}:${e.entidad_id}`}
                onClick={() => elegirEntidad(e)}
                className="w-full text-left px-2.5 py-1.5 rounded-lg"
                style={{ background: activa ? 'var(--tx-accent-subtle)' : 'transparent' }}
              >
                <span className="block text-[13px] text-[var(--tx-ink-primary)] truncate">
                  {e.entidad_nombre}
                </span>
                <span className="block text-[11px] text-[var(--tx-ink-muted)]">
                  {ENTIDAD_LABEL[e.entidad_tipo as keyof typeof ENTIDAD_LABEL] ?? e.entidad_tipo} · {e.total}{' '}
                  {e.total === 1 ? 'hecho' : 'hechos'}
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Timeline */}
      <section className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <SearchIcon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-ink-muted)]" />
            <Input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && consultar({})}
              placeholder="Buscar en la bitácora…"
              aria-label="Buscar en la bitácora"
              className="pl-9"
            />
          </div>

          <NuevaNota
            entidades={entidades}
            onCreada={(entrada) => setEntradas((previas) => [entrada, ...previas])}
          >
            <Button size="sm">
              <PlusIcon className="size-4" />
              Anotar
            </Button>
          </NuevaNota>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4 shrink-0">
          <FiltroChip activo={fuente === null} onClick={() => elegirFuente(null)}>
            Todo
          </FiltroChip>
          {FUENTES.map((f) => (
            <FiltroChip key={f} activo={fuente === f} color={FUENTE_COLOR[f]} onClick={() => elegirFuente(f)}>
              {FUENTE_LABEL[f]}
            </FiltroChip>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {cargando ? (
            <p className="text-sm text-[var(--tx-ink-muted)]">Buscando…</p>
          ) : dias.length === 0 ? (
            <p className="text-sm text-[var(--tx-ink-muted)]">
              Nada por acá todavía. La bitácora se llena sola con los contactos, los WhatsApp y las reuniones.
            </p>
          ) : (
            dias.map(({ dia, entradas: delDia }) => (
              <div key={dia} className="mb-6">
                <h3 className="text-[12px] uppercase tracking-wide text-[var(--tx-ink-muted)] mb-2">
                  {DIA_LARGO.format(new Date(`${dia}T12:00:00Z`))}
                </h3>

                <ol className="space-y-2">
                  {delDia.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-xl p-3.5"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderLeft: `3px solid ${FUENTE_COLOR[e.fuente]}`,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-[14px] font-medium text-[var(--tx-ink-primary)]">
                          {e.titulo}
                        </span>
                        <span className="text-[11px] text-[var(--tx-ink-muted)] shrink-0 tabular-nums">
                          {HORA.format(new Date(e.ocurrio_at))}
                        </span>
                      </div>

                      {e.contenido && <Contenido texto={e.contenido} />}

                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-[var(--tx-ink-muted)]">
                        <span
                          className="px-1.5 py-0.5 rounded-md"
                          style={{ background: `color-mix(in oklab, ${FUENTE_COLOR[e.fuente]} 18%, transparent)` }}
                        >
                          {FUENTE_LABEL[e.fuente]}
                        </span>
                        <span>{e.entidad_nombre}</span>
                        {e.autor_nombre && <span>· {e.autor_nombre}</span>}
                        <EnlaceOriginal metadata={e.metadata} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Lo destilado de #chatia viene en markdown y puede ser largo. Se muestra
 * recortado y se abre entero con un clic: el timeline sigue siendo escaneable.
 */
function Contenido({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false)
  const largo = texto.length > 320 || texto.split('\n').length > 5

  return (
    <div>
      <div className={!abierto && largo ? 'max-h-[6.5rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]' : ''}>
        <Markdown>{texto}</Markdown>
      </div>
      {largo && (
        <button
          onClick={() => setAbierto((v) => !v)}
          className="mt-1 text-[11px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] underline underline-offset-2"
          aria-expanded={abierto}
        >
          {abierto ? 'Ver menos' : 'Ver todo'}
        </button>
      )}
    </div>
  )
}

/** Puente al origen: el mensaje en Discord, el PR en GitHub. */
function EnlaceOriginal({ metadata }: { metadata: Record<string, unknown> }) {
  const url = typeof metadata?.url === 'string' ? metadata.url : null
  if (!url || !/^https?:\/\//i.test(url)) return null

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 hover:text-[var(--tx-ink-primary)]"
    >
      Ver original
    </a>
  )
}

function FiltroChip({
  activo,
  color,
  onClick,
  children,
}: {
  activo: boolean
  color?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className="text-[12px] px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: activo
          ? color
            ? `color-mix(in oklab, ${color} 22%, transparent)`
            : 'var(--tx-accent-subtle)'
          : 'rgba(255,255,255,0.04)',
        color: 'var(--tx-ink-primary)',
        border: `1px solid ${activo && color ? color : 'transparent'}`,
      }}
    >
      {children}
    </button>
  )
}
