'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useReducedMotion } from 'framer-motion'
import { Building2, Maximize2 } from 'lucide-react'
import { ESTADOS_OFICINA, type EstadoOficina } from '@/lib/agentes/estado-oficina'
import { ZONAS_OFICINA, type ZonaOficina } from '@/lib/agentes/distribucion-oficina'
import type { ActividadAgente, AgenteSala } from '@/lib/types/sala-agentes'
import { useActividadEnVivo } from '@/lib/vex/usar-actividad-en-vivo'
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

interface OficinaProps {
  agentes: AgenteSala[]
  zonas: Record<ZonaOficina, number>
  /** Ir a la sección de Intelligence que representa la zona. */
  alIr: (zona: ZonaOficina) => void
}

export function OficinaAgentes({ agentes: todos, zonas, alIr }: OficinaProps) {
  // Un agente con la credencial desactivada ya no tiene escritorio.
  const agentes = useMemo(() => todos.filter((a) => a.oficina.fuente !== 'desactivado'), [todos])
  const router = useRouter()
  const sinMovimiento = useReducedMotion() ?? false
  const puede3D = useSyncExternalStore(sinSuscripcion, hayWebGL, () => true)
  const [elegido, setElegido] = useState<string | null>(null)
  const [verSala, setVerSala] = useState(0)
  const [enPantalla, setEnPantalla] = useState(true)
  const [ahora, setAhora] = useState(0)
  const marco = useRef<HTMLDivElement>(null)
  const anclas = useRef<Map<string, HTMLElement>>(new Map())

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
          style={{ border: '1px solid var(--tx-border)', background: '#eef1f6', touchAction: 'none' }}
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
            <div
              role="status"
              className="flex min-w-0 flex-col gap-1.5 rounded-xl p-3 text-xs"
              style={{ border: `1px solid ${actual.colorHex}55`, background: 'var(--tx-surface-1)' }}
            >
              <p className="text-sm font-semibold text-[var(--tx-ink-primary)]">{actual.nombre}</p>
              <p className="text-[var(--tx-ink-muted)]">{actual.oficio}</p>
              <p style={{ color: COLOR_ESTADO[actual.oficina.estado] }} className="font-medium">
                {NOMBRE_ESTADO[actual.oficina.estado]}
                {actual.oficina.nota ? `: ${actual.oficina.nota}` : ''}
              </p>
              <p className="text-[var(--tx-ink-secondary)]">{EXPLICACION[actual.oficina.fuente]}</p>
              {actual.humano && <p className="text-[var(--tx-ink-muted)]">Trabaja a nombre de {actual.humano}.</p>}
            </div>
          )}
        </div>
      </div>
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
