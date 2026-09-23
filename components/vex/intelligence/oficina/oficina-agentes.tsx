'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useReducedMotion } from 'framer-motion'
import { Building2, Maximize2 } from 'lucide-react'
import { ESTADOS_OFICINA, type EstadoOficina } from '@/lib/agentes/estado-oficina'
import { ZONAS_OFICINA, type ZonaOficina } from '@/lib/agentes/distribucion-oficina'
import { encargosQueCambiaron, type EncargoPantalla } from '@/lib/agentes/pantalla-cola'
import type { ActividadAgente, AgenteSala } from '@/lib/types/sala-agentes'
import { useActividadEnVivo } from '@/lib/vex/usar-actividad-en-vivo'
import { haceSegundos } from '@/lib/agentes/historial-actividad'
import { DEFINICION_TRAJE, TRAJES, type TrajeAgente } from '@/lib/agentes/estilo-agente'
import { cambiarEstiloAgente } from '@/app/(app)/vex/intelligence/acciones'
import { COLOR_ESTADO, NOMBRE_ESTADO } from './estados'

/**
 * La oficina de los agentes, en 3D y en vivo, al estilo de SAMS.
 *
 * Sobre el agente que trabaja flota un panel holográfico con lo que está
 * haciendo de verdad: el encargo o la nota, la herramienta que usa en este
 * momento (la manda el hook de Claude Code) y cuánto lleva en el turno.
 *
 * Para un lector de pantalla, la escena es decorativa: la misma información
 * va en la lista de agentes, que además se maneja con el teclado.
 */

const EscenaOficina = dynamic(() => import('./escena-oficina'), { ssr: false, loading: () => <Cargando /> })

let webglCache: boolean | null = null
function hayWebGL(): boolean {
  if (webglCache === null) {
    try {
      const c = document.createElement('canvas')
      webglCache = Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
    } catch {
      webglCache = false
    }
  }
  return webglCache
}
const sinSuscripcion = () => () => {}

const NOMBRE_ZONA: Record<ZonaOficina, (n: number) => string> = {
  cola: (n) => `Cola · ${n} esperando permiso`,
  conocimiento: (n) => `Conocimiento · ${n} documentos`,
  whatsapp: (n) => `WhatsApp · ${n} sin leer`,
  directivas: (n) => `Directivas · ${n} vigentes`,
}

/** En celular, el cartel corto: el nombre de la zona y su número. */
const NOMBRE_ZONA_CORTO: Record<ZonaOficina, string> = {
  cola: 'Cola',
  conocimiento: 'Conocimiento',
  whatsapp: 'WhatsApp',
  directivas: 'Directivas',
}

const EXPLICACION: Record<AgenteSala['oficina']['fuente'], string> = {
  encargo: 'Tiene un encargo tomado.',
  permiso: 'Tiene un encargo esperando que alguien lo apruebe en la Cola.',
  declarado: 'Lo declaró el propio agente (por su puente, el MCP o el hook de Claude Code).',
  latido: 'Según su última señal: no declaró nada.',
  desactivado: 'Su credencial está desactivada.',
}

/** Un turno se da por abierto si la última herramienta fue hace menos de esto. */
const TURNO_VIVO_MS = 35 * 60_000

function reloj(desdeIso: string | null, ahora: number): string | null {
  if (!desdeIso || !ahora) return null
  const s = Math.max(0, Math.floor((ahora - Date.parse(desdeIso)) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`
}

function turnoAbierto(a: ActividadAgente | null, ahora: number): boolean {
  if (!a?.turnoDesde || !ahora) return false
  const ultima = Date.parse(a.herramientaAt ?? a.turnoDesde)
  return ahora - ultima < TURNO_VIVO_MS
}

/** Cada cuánto, como mucho, uno que descansa se levanta a revisar la Cola. */
const PASEO_CADA_MS = 25_000
/** Cuánto espera un agente antes de volver a ir a mirar, si nada cambió. */
const ENTRE_PASEOS_MS = 90_000

interface OficinaProps {
  agentes: AgenteSala[]
  /** La Cola: la muestra la pantalla grande, y sus cambios mueven a los agentes. */
  encargos: EncargoPantalla[]
  zonas: Record<ZonaOficina, number>
  /** Ir a la sección de Intelligence que representa la zona. */
  alIr: (zona: ZonaOficina) => void
}

export function OficinaAgentes({ agentes: todos, encargos, zonas, alIr }: OficinaProps) {
  // Un agente con la credencial desactivada ya no tiene escritorio.
  // El traje recién elegido se ve al instante, sin esperar a la base. Vale solo
  // mientras no llegue una lista nueva del servidor: esa ya trae lo guardado.
  const [eleccion, setEleccion] = useState<{ base: AgenteSala[]; trajes: Record<string, TrajeAgente> }>({ base: todos, trajes: {} })
  const trajes = eleccion.base === todos ? eleccion.trajes : null
  const agentes = useMemo(
    () =>
      todos
        .filter((a) => a.oficina.fuente !== 'desactivado')
        .map((a) => (trajes?.[a.id] ? { ...a, estilo: { traje: trajes[a.id] } } : a)),
    [todos, trajes],
  )
  const router = useRouter()
  const sinMovimiento = useReducedMotion() ?? false
  const puede3D = useSyncExternalStore(sinSuscripcion, hayWebGL, () => true)
  const [elegido, setElegido] = useState<string | null>(null)
  const [verSala, setVerSala] = useState(0)
  const [enPantalla, setEnPantalla] = useState(true)
  const [ahora, setAhora] = useState(0)
  const marco = useRef<HTMLDivElement>(null)
  const anclas = useRef<Map<string, HTMLElement>>(new Map())

  // Quién tiene que ir a mirar la pantalla: sube el número de ese agente.
  // Se decide mientras se renderiza (no en un efecto) comparando con la Cola
  // anterior: un encargo nuevo o que cambió de estado mueve a su agente.
  const [visitas, setVisitas] = useState<Record<string, number>>({})
  const [colaAnterior, setColaAnterior] = useState(encargos)
  if (colaAnterior !== encargos) {
    const antes = new Map(colaAnterior.map((e) => [e.id, e.estado]))
    const mover = new Set(encargosQueCambiaron(antes, encargos).map((e) => e.agenteId))
    setColaAnterior(encargos)
    if (mover.size > 0) {
      setVisitas((v) => {
        const nuevo = { ...v }
        for (const id of mover) nuevo[id] = (nuevo[id] ?? 0) + 1
        return nuevo
      })
    }
  }

  // Y de vez en cuando, uno que descansa se levanta a revisar la Cola: es lo
  // que hace de verdad su puente, que la consulta cada pocos segundos.
  const ultimoPaseo = useRef<Record<string, number>>({})
  useEffect(() => {
    if (!enPantalla || sinMovimiento) return
    const t = setInterval(() => {
      const ahoraMs = Date.now()
      const libres = agentes.filter(
        (a) => a.oficina.estado === 'descansando' && ahoraMs - (ultimoPaseo.current[a.id] ?? 0) > ENTRE_PASEOS_MS,
      )
      if (libres.length === 0) return
      const elegidoAhora = libres[Math.floor(Math.random() * libres.length)]
      ultimoPaseo.current[elegidoAhora.id] = ahoraMs
      setVisitas((v) => ({ ...v, [elegidoAhora.id]: (v[elegidoAhora.id] ?? 0) + 1 }))
    }, PASEO_CADA_MS)
    return () => clearInterval(t)
  }, [agentes, enPantalla, sinMovimiento])

  const actividadInicial = useMemo(() => Object.fromEntries(todos.map((a) => [a.id, a.actividad])), [todos])
  const actividad = useActividadEnVivo(actividadInicial)

  // El reloj de los paneles avanza cada segundo, solo mientras se ve.
  useEffect(() => {
    if (!enPantalla) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [enPantalla])

  useEffect(() => {
    const el = marco.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => setEnPantalla(e.isIntersecting), { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Lo declarado vence: en ese momento se le vuelve a pedir el estado al servidor.
  useEffect(() => {
    const vencen = agentes
      .map((a) => (a.oficina.venceAt ? Date.parse(a.oficina.venceAt) - Date.now() : -1))
      .filter((ms) => ms > 0)
    if (vencen.length === 0) return
    const t = setTimeout(() => router.refresh(), Math.min(...vencen) + 1500)
    return () => clearTimeout(t)
  }, [agentes, router])

  const registrar = (clave: string) => (el: HTMLElement | null) => {
    if (el) anclas.current.set(clave, el)
    else anclas.current.delete(clave)
  }

  const actual = agentes.find((a) => a.id === elegido) ?? null
  const cuenta = (e: EstadoOficina) => agentes.filter((a) => a.oficina.estado === e).length

  return (
    <section aria-labelledby="oficina-titulo" className="flex min-w-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id="oficina-titulo" className="flex items-center gap-2 text-base font-semibold text-[var(--tx-ink-primary)]">
            <Building2 size={16} aria-hidden="true" style={{ color: 'var(--tx-accent)' }} />
            La oficina
          </h2>
          <p className="text-xs text-[var(--tx-ink-muted)]">
            En vivo. Toque un agente para acercarse; toque una zona para ir a esa sección.
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Resumen por estado">
          {ESTADOS_OFICINA.map((e) => (
            <li
              key={e}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[var(--tx-ink-secondary)]"
              style={{ border: '1px solid var(--tx-border)' }}
            >
              <span className="size-2 rounded-full" style={{ background: COLOR_ESTADO[e] }} aria-hidden="true" />
              {NOMBRE_ESTADO[e]} · {cuenta(e)}
            </li>
          ))}
        </ul>
      </header>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div
          ref={marco}
          className="relative h-[420px] min-w-0 overflow-hidden rounded-2xl sm:h-[520px] xl:h-[600px]"
          style={{
            border: '1px solid var(--tx-border)',
            // El fondo del estudio: pastel, como las referencias de SAMS.
            background:
              'radial-gradient(900px 520px at 18% 0%, #dde8ff 0%, transparent 62%), radial-gradient(760px 520px at 92% 8%, #ffe9dc 0%, transparent 58%), linear-gradient(180deg, #f2f5fa 0%, #e9edf4 100%)',
            touchAction: 'none',
          }}
        >
          {agentes.length === 0 ? (
            <p className="grid h-full place-items-center p-6 text-center text-sm" style={{ color: '#5b6474' }}>
              Todavía no hay agentes con credencial. Cuando se cree uno, aparece acá su escritorio.
            </p>
          ) : !puede3D ? (
            <p className="grid h-full place-items-center p-6 text-center text-sm" style={{ color: '#5b6474' }}>
              Este navegador no puede dibujar 3D. El estado de cada agente está en la lista.
            </p>
          ) : (
            <>
              <div aria-hidden="true" className="absolute inset-0">
                <EscenaOficina
                  agentes={agentes}
                  encargos={encargos}
                  visitas={visitas}
                  alIr={alIr}
                  seleccionado={elegido}
                  alSeleccionar={setElegido}
                  animar={!sinMovimiento && enPantalla}
                  anclas={anclas}
                  zonas={zonas}
                  verSala={verSala}
                />
              </div>

              {/* Lo que flota sobre la escena. La escena mueve cada elemento a su lugar. */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                {agentes.map((a) => {
                  const act = actividad[a.id] ?? null
                  const trabajando = a.oficina.estado === 'trabajando' || turnoAbierto(act, ahora)
                  return (
                    <div key={a.id}>
                      <div ref={registrar(`n:${a.id}`)} className="absolute left-0 top-0 opacity-0 will-change-transform">
                        {/* El que no está va en tono tenue: no compite con los que trabajan. */}
                        <span
                          className={`items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                            // En celular, los que no están no ponen cartel: siguen en la lista de abajo.
                            a.oficina.estado === 'ausente' && a.id !== elegido ? 'hidden sm:flex' : 'flex'
                          }`}
                          style={
                            a.oficina.estado === 'ausente' && a.id !== elegido
                              ? { background: 'rgb(255 255 255 / 0.75)', color: '#7a8394', boxShadow: '0 1px 4px rgb(20 30 50 / 0.1)' }
                              : { background: '#1d2433', color: '#ffffff', boxShadow: `0 0 0 ${a.id === elegido ? 2 : 0}px ${a.colorHex}, 0 4px 12px rgb(20 30 50 / 0.18)` }
                          }
                        >
                          <span className="size-1.5 rounded-full" style={{ background: COLOR_ESTADO[a.oficina.estado] }} />
                          {a.nombre}
                        </span>
                      </div>
                      {trabajando && (
                        <div ref={registrar(`h:${a.id}`)} className="absolute left-0 top-0 opacity-0 will-change-transform">
                          <PanelHolo agente={a} actividad={act} ahora={ahora} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Los carteles de las zonas se pueden tocar: llevan a su sección. */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {ZONAS_OFICINA.map((z) => (
                  <div key={z} ref={registrar(`z:${z}`)} className="absolute left-0 top-0 opacity-0 will-change-transform">
                    <button
                      type="button"
                      onClick={() => alIr(z)}
                      tabIndex={elegido ? -1 : 0}
                      className="pointer-events-auto whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-2"
                      // De cerca, los carteles de las zonas taparían al agente elegido.
                      style={{
                        background: 'rgb(255 255 255 / 0.9)',
                        color: '#2a3244',
                        boxShadow: '0 2px 8px rgb(20 30 50 / 0.12)',
                        visibility: elegido ? 'hidden' : 'visible',
                      }}
                    >
                      <span className="sm:hidden">
                        {NOMBRE_ZONA_CORTO[z]} · {zonas[z]}
                      </span>
                      <span className="hidden sm:inline">{NOMBRE_ZONA[z](zonas[z])}</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="absolute left-3 top-3 flex max-w-[calc(100%-120px)] flex-wrap gap-1">
                {agentes.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setElegido(a.id === elegido ? null : a.id)}
                    aria-label={`Acercarse a ${a.nombre}`}
                    aria-pressed={a.id === elegido}
                    className="grid size-8 place-items-center rounded-full text-[11px] font-bold text-white transition-transform duration-150 hover:scale-110 active:scale-95 focus-visible:outline-2"
                    style={{ background: a.colorHex, boxShadow: `0 0 0 2px ${a.id === elegido ? '#1d2433' : '#ffffff'}` }}
                  >
                    {a.nombre.slice(0, 1)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setElegido(null)
                  setVerSala((v) => v + 1)
                }}
                className="absolute right-3 top-3 flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-2"
                style={{ background: '#ffffff', color: '#2a3244', boxShadow: '0 2px 10px rgb(20 30 50 / 0.14)' }}
              >
                <Maximize2 size={13} aria-hidden="true" />
                Ver sala
              </button>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <ul aria-label="Agentes en la oficina" className="flex min-w-0 flex-col gap-1.5">
            {agentes.map((a) => {
              const activo = a.id === elegido
              const herr = actividad[a.id]?.herramienta
              return (
                <li key={a.id} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setElegido(activo ? null : a.id)}
                    className="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-[background-color,border-color] duration-150 hover:bg-[var(--tx-surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      border: `1px solid ${activo ? a.colorHex : 'var(--tx-border)'}`,
                      background: activo ? 'var(--tx-surface-2)' : 'var(--tx-surface-1)',
                    }}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLOR_ESTADO[a.oficina.estado] }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[var(--tx-ink-primary)]">{a.nombre}</span>
                      <span className="block truncate text-[11px] text-[var(--tx-ink-muted)]">
                        {NOMBRE_ESTADO[a.oficina.estado]}
                        {herr && turnoAbierto(actividad[a.id] ?? null, ahora) ? ` · ${herr}` : a.oficina.nota ? ` · ${a.oficina.nota}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {actual && (
            <FichaAgente
              agente={actual}
              actividad={actividad[actual.id] ?? null}
              encargo={encargos.find((e) => e.agenteId === actual.id && e.estado === 'en_curso') ?? null}
              ahora={ahora}
              alVestir={(traje) => setEleccion((e) => ({ base: todos, trajes: { ...(e.base === todos ? e.trajes : {}), [actual.id]: traje } }))}
              alFallar={() => setEleccion({ base: todos, trajes: {} })}
            />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * La ficha de un agente: qué está haciendo, de verdad y en detalle. Antes
 * mostraba solo el estado y una nota ("En TryvexPlataform"), y al tocar a un
 * agente no se sabía en qué andaba.
 */
function FichaAgente({
  agente,
  actividad,
  encargo,
  ahora,
  alVestir,
  alFallar,
}: {
  agente: AgenteSala
  actividad: ActividadAgente | null
  encargo: EncargoPantalla | null
  ahora: number
  alVestir: (traje: TrajeAgente) => void
  alFallar: () => void
}) {
  const enTurno = turnoAbierto(actividad, ahora)
  const tiempo = enTurno ? reloj(actividad?.turnoDesde ?? null, ahora) : null
  const recientes = actividad?.recientes ?? []
  const colorEstado = COLOR_ESTADO[agente.oficina.estado]

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 flex-col gap-3 rounded-xl p-3.5 text-xs"
      style={{ border: `1px solid ${agente.colorHex}55`, background: 'var(--tx-surface-1)' }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--tx-ink-primary)]">{agente.nombre}</p>
          <p className="truncate text-[var(--tx-ink-muted)]">{agente.oficio}</p>
        </div>
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: colorEstado, background: `${colorEstado}1f` }}
        >
          <span className="size-1.5 rounded-full" style={{ background: colorEstado }} />
          {NOMBRE_ESTADO[agente.oficina.estado]}
        </span>
      </div>

      <section aria-label="Ahora mismo" className="flex min-w-0 flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)]">Ahora mismo</p>
        {enTurno && actividad?.herramienta ? (
          <>
            <p className="truncate rounded-md px-2 py-1 font-mono text-[11px] text-[var(--tx-ink-primary)]" style={{ background: 'var(--tx-surface-2)' }}>
              <span style={{ color: agente.colorHex }}>&gt;</span> {actividad.herramienta}
            </p>
            <p className="text-[var(--tx-ink-secondary)]">
              {tiempo ? `En su turno hace ${tiempo}` : 'En su turno'}
              {actividad.herramientasTurno > 0
                ? ` · ${actividad.herramientasTurno} ${actividad.herramientasTurno === 1 ? 'herramienta' : 'herramientas'}`
                : ''}
            </p>
          </>
        ) : (
          <p className="text-[var(--tx-ink-secondary)]">{agente.oficina.nota ?? NOMBRE_ESTADO[agente.oficina.estado]}</p>
        )}
      </section>

      {encargo && (
        <section aria-label="Su encargo" className="flex min-w-0 flex-col gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)]">Su encargo</p>
          <p className="text-[var(--tx-ink-primary)]">{encargo.titulo}</p>
        </section>
      )}

      <section aria-label="Lo último que hizo" className="flex min-w-0 flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)]">Lo último que hizo</p>
        {recientes.length > 0 ? (
          <ol className="flex min-w-0 flex-col gap-0.5">
            {recientes.map((r, i) => (
              <li key={`${r.at}-${i}`} className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-[var(--tx-ink-secondary)]">{r.h}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-[var(--tx-ink-muted)]">
                  {ahora ? haceSegundos(r.at, ahora) : ''}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[var(--tx-ink-muted)]">
            Sin registro todavía. Aparece cuando su dueño conecta el hook de la oficina:{' '}
            <code className="font-mono text-[10.5px]">node scripts/hook-oficina.mjs --instalar</code>
          </p>
        )}
      </section>

      <SelectorTraje agente={agente} alVestir={alVestir} alFallar={alFallar} />

      <p className="text-[10.5px] text-[var(--tx-ink-muted)]">
        {EXPLICACION[agente.oficina.fuente]}
        {agente.humano ? ` Trabaja a nombre de ${agente.humano}.` : ''}
      </p>
    </div>
  )
}

/** Elegir el traje del agente. Se ve al tiro en la oficina y queda guardado para todo el equipo. */
function SelectorTraje({
  agente,
  alVestir,
  alFallar,
}: {
  agente: AgenteSala
  alVestir: (traje: TrajeAgente) => void
  alFallar: () => void
}) {
  const [guardando, iniciar] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const vestir = (traje: TrajeAgente) => {
    if (traje === agente.estilo.traje) return
    setError(null)
    alVestir(traje)
    iniciar(async () => {
      const r = await cambiarEstiloAgente({ agenteId: agente.id, traje })
      if (!r.ok) {
        alFallar()
        setError(r.error)
      }
    })
  }

  return (
    <section aria-label="Estilo" className="flex min-w-0 flex-col gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-ink-muted)]">
        Estilo{guardando ? ' · guardando…' : ''}
      </p>
      <div role="radiogroup" aria-label={`Traje de ${agente.nombre}`} className="flex flex-wrap gap-1.5">
        {TRAJES.map((t) => {
          const puesto = agente.estilo.traje === t
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={puesto}
              onClick={() => vestir(t)}
              className="min-h-8 rounded-full px-3 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                border: `1px solid ${puesto ? agente.colorHex : 'var(--tx-border-strong)'}`,
                background: puesto ? `${agente.colorHex}22` : 'transparent',
                color: puesto ? 'var(--tx-ink-primary)' : 'var(--tx-ink-secondary)',
                outlineColor: agente.colorHex,
              }}
            >
              {DEFINICION_TRAJE[t].nombre}
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="text-[var(--tx-error)]">✗ {error}</p>}
    </section>
  )
}

/**
 * El panel holográfico: lo que el agente está haciendo de verdad, como el
 * panel de sesión que SAMS pone sobre cada agente.
 */
function PanelHolo({ agente, actividad, ahora }: { agente: AgenteSala; actividad: ActividadAgente | null; ahora: number }) {
  const tiempo = reloj(actividad?.turnoDesde ?? null, ahora)
  const herramienta = turnoAbierto(actividad, ahora) ? actividad?.herramienta : null
  return (
    <div
      className="relative mb-2 w-[190px] rounded-2xl p-2.5 text-left sm:w-[228px]"
      style={{
        background: 'rgb(255 255 255 / 0.82)',
        backdropFilter: 'blur(10px)',
        boxShadow: `0 0 0 1px ${agente.colorHex}55, 0 10px 30px rgb(20 30 50 / 0.18), 0 0 24px ${agente.colorHex}33`,
        color: '#1d2433',
      }}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider">
        <span className="flex items-center gap-1.5" style={{ color: '#1f9d63' }}>
          <span className="size-1.5 rounded-full motion-safe:animate-pulse" style={{ background: '#3fcf8e' }} />
          Trabajando
        </span>
        {tiempo && <span className="tabular-nums text-[#5b6474]">{tiempo}</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug">{agente.oficina.nota ?? 'Trabajando'}</p>
      {herramienta && (
        <p className="mt-1.5 truncate rounded-md px-1.5 py-1 font-mono text-[10.5px]" style={{ background: '#eef1f6', color: '#2a3244' }}>
          <span style={{ color: agente.colorHex }}>&gt;</span> {herramienta}
        </p>
      )}
      {actividad && actividad.herramientasTurno > 0 && (
        <p className="mt-1 text-[10px] text-[#5b6474]">
          {actividad.herramientasTurno} {actividad.herramientasTurno === 1 ? 'herramienta' : 'herramientas'} en este turno
        </p>
      )}
      {/* La punta que apunta al agente */}
      <span
        className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45"
        style={{ background: 'rgb(255 255 255 / 0.9)', boxShadow: `1px 1px 0 ${agente.colorHex}55` }}
      />
    </div>
  )
}

function Cargando() {
  return (
    <div className="grid h-full place-items-center text-xs" style={{ color: '#5b6474' }}>
      <span className="motion-safe:animate-pulse">Armando la oficina…</span>
    </div>
  )
}
