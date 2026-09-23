'use client'

import { useState, useTransition } from 'react'
import { Check, Clock, Hand, HelpCircle, Inbox, Send, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CaraAgente } from './cara-agente'
import { useEncargosEnVivo } from '@/lib/vex/usar-encargos-en-vivo'
import type { EncargoReal } from '@/lib/repos/intelligence-real'
import type { AgenteSala } from '@/lib/types/sala-agentes'

/**
 * La cola de trabajo entre el equipo y los agentes.
 *
 * Es la pieza que convierte a Intelligence en algo que se usa, y no solo algo
 * que se mira: una persona le encola una tarea o una duda a un agente, y el
 * agente responde acá mismo.
 *
 * La regla que ordena toda la pantalla: **un encargo encolado no se ejecuta.**
 * Queda esperando hasta que alguien del equipo lo aprueba. Por eso lo que está
 * esperando permiso va primero y con el borde marcado: es lo único que está
 * detenido por falta de una decisión humana.
 *
 * Nada de lo que se ve acá está escrito en el código: sale de `agente_encargos`
 * y se actualiza sola cuando alguien encola o responde desde otro dispositivo.
 */

interface PanelColaProps {
  agentes: AgenteSala[]
  /** La cola que resolvió el servidor en la primera carga. */
  inicial: EncargoReal[]
  /** Vuelve a pedir la cola entera. La usa el tiempo real. */
  recargar: () => Promise<EncargoReal[]>
  /** Encolar, aprobar, rechazar y archivar. Se resuelven en el servidor. */
  alEncolar: (datos: {
    agenteId: string
    tipo: 'tarea' | 'duda'
    titulo: string
    detalle?: string
    prioridad: 'baja' | 'media' | 'alta'
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  alAprobar: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
  alRechazar: (id: string, motivo: string) => Promise<{ ok: true } | { ok: false; error: string }>
  alArchivar: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

const TEXTO_ESTADO: Record<EncargoReal['estado'], string> = {
  encolado: 'esperando permiso',
  aprobado: 'aprobado, puede trabajarlo',
  en_curso: 'trabajando',
  respondido: 'respondió',
  rechazado: 'rechazado',
}

export function PanelCola({
  agentes,
  inicial,
  recargar,
  alEncolar,
  alAprobar,
  alRechazar,
  alArchivar,
}: PanelColaProps) {
  const { encargos } = useEncargosEnVivo({ inicial, recargar })
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const porId = new Map(agentes.map((a) => [a.id, a]))
  const esperando = encargos.filter((e) => e.estado === 'encolado')
  const trabajando = encargos.filter((e) => e.estado === 'aprobado' || e.estado === 'en_curso')
  const resueltos = encargos.filter((e) => e.estado === 'respondido' || e.estado === 'rechazado')

  const correr = (accion: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    empezar(async () => {
      const r = await accion()
      setAviso(r.ok ? null : r.error)
    })
  }

  return (
    <section aria-labelledby="titulo-cola" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h2 id="titulo-cola" className="text-base font-semibold text-[var(--tx-ink-primary)]">
            Cola de encargos
          </h2>
          <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
            Lo que el equipo le pidió a los agentes. Nada se ejecuta sin que una persona lo apruebe.
          </p>
        </div>
      </header>

      <FormularioEncargo agentes={agentes} alEncolar={alEncolar} pendiente={pendiente} />

      {aviso && (
        <p
          className="rounded-xl px-3 py-2 text-xs"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-error) 40%, transparent)',
            background: 'color-mix(in oklab, var(--tx-error) 10%, transparent)',
            color: 'var(--tx-ink-primary)',
          }}
          role="alert"
        >
          {aviso}
        </p>
      )}

      <Grupo
        titulo="Esperando permiso"
        ayuda="El agente lo ve, pero no puede trabajarlo hasta que alguien lo apruebe."
        encargos={esperando}
        porId={porId}
        destacado
        pendiente={pendiente}
        alAprobar={(id) => correr(() => alAprobar(id))}
        alRechazar={(id, motivo) => correr(() => alRechazar(id, motivo))}
        alArchivar={(id) => correr(() => alArchivar(id))}
      />

      <Grupo
        titulo="En manos del agente"
        ayuda="Ya tiene permiso. Lo que responda aparece acá solo."
        encargos={trabajando}
        porId={porId}
        pendiente={pendiente}
        alAprobar={(id) => correr(() => alAprobar(id))}
        alRechazar={(id, motivo) => correr(() => alRechazar(id, motivo))}
        alArchivar={(id) => correr(() => alArchivar(id))}
      />

      <Grupo
        titulo="Resueltos"
        ayuda="Archivar lo saca de la cola. No se borra: queda el historial de quién pidió, quién aprobó y qué contestó."
        encargos={resueltos}
        porId={porId}
        pendiente={pendiente}
        alAprobar={(id) => correr(() => alAprobar(id))}
        alRechazar={(id, motivo) => correr(() => alRechazar(id, motivo))}
        alArchivar={(id) => correr(() => alArchivar(id))}
      />

      {encargos.length === 0 && (
        <p
          className="flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-sm text-[var(--tx-ink-muted)]"
          style={{ border: '1px dashed var(--tx-border)' }}
        >
          <Inbox size={20} />
          La cola está vacía. Encárguele algo a un agente con el formulario de arriba.
        </p>
      )}
    </section>
  )
}

function FormularioEncargo({
  agentes,
  alEncolar,
  pendiente,
}: {
  agentes: AgenteSala[]
  alEncolar: PanelColaProps['alEncolar']
  pendiente: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [agenteId, setAgenteId] = useState(agentes[0]?.id ?? '')
  const [tipo, setTipo] = useState<'tarea' | 'duda'>('tarea')
  const [titulo, setTitulo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [prioridad, setPrioridad] = useState<'baja' | 'media' | 'alta'>('media')
  const [error, setError] = useState<string | null>(null)

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setAbierto(true)}>
        <Send size={13} className="mr-1.5" />
        Encargarle algo a un agente
      </Button>
    )
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl p-3.5"
      style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
      onSubmit={async (evento) => {
        evento.preventDefault()
        const r = await alEncolar({ agenteId, tipo, titulo, detalle, prioridad })
        if (r.ok) {
          setTitulo('')
          setDetalle('')
          setError(null)
          setAbierto(false)
        } else {
          // Nunca un rechazo mudo: si no se encoló, se dice por qué.
          setError(r.error)
        }
      }}
    >
      {/* En el celular cada campo ocupa su línea; en pantalla ancha van juntos. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Campo etiqueta="Agente">
          <select
            value={agenteId}
            onChange={(e) => setAgenteId(e.target.value)}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              border: '1px solid var(--tx-border)',
              background: 'var(--tx-surface-2)',
              color: 'var(--tx-ink-primary)',
            }}
          >
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Qué es">
          <div className="flex gap-1">
            {(['tarea', 'duda'] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTipo(valor)}
                aria-pressed={tipo === valor}
                className="flex-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
                style={{
                  border: '1px solid var(--tx-border)',
                  background: tipo === valor ? 'var(--tx-surface-0)' : 'transparent',
                  color: tipo === valor ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
                }}
              >
                {valor === 'tarea' ? 'Tarea' : 'Duda'}
              </button>
            ))}
          </div>
        </Campo>

        <Campo etiqueta="Prioridad">
          <select
            value={prioridad}
            onChange={(e) => setPrioridad(e.target.value as 'baja' | 'media' | 'alta')}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              border: '1px solid var(--tx-border)',
              background: 'var(--tx-surface-2)',
              color: 'var(--tx-ink-primary)',
            }}
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </Campo>
      </div>

      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder={tipo === 'tarea' ? 'Qué tiene que hacer' : 'Qué le quiere preguntar'}
        required
        minLength={3}
        maxLength={200}
        className="w-full rounded-lg px-2.5 py-2 text-sm"
        style={{
          border: '1px solid var(--tx-border)',
          background: 'var(--tx-surface-2)',
          color: 'var(--tx-ink-primary)',
        }}
      />

      <textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        placeholder="Detalle, contexto, enlaces… (opcional)"
        rows={3}
        maxLength={4000}
        className="w-full rounded-lg px-2.5 py-2 text-xs"
        style={{
          border: '1px solid var(--tx-border)',
          background: 'var(--tx-surface-2)',
          color: 'var(--tx-ink-primary)',
        }}
      />

      {error && (
        <p className="text-xs" role="alert" style={{ color: 'var(--tx-error)' }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[11px] text-[var(--tx-ink-muted)]">
          Queda esperando permiso: el agente no lo trabaja hasta que alguien lo apruebe.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pendiente || titulo.trim().length < 3}>
          Encolar
        </Button>
      </div>
    </form>
  )
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11px] text-[var(--tx-ink-muted)]">{etiqueta}</span>
      {children}
    </label>
  )
}

function Grupo({
  titulo,
  ayuda,
  encargos,
  porId,
  destacado = false,
  pendiente,
  alAprobar,
  alRechazar,
  alArchivar,
}: {
  titulo: string
  ayuda: string
  encargos: EncargoReal[]
  porId: Map<string, AgenteSala>
  destacado?: boolean
  pendiente: boolean
  alAprobar: (id: string) => void
  alRechazar: (id: string, motivo: string) => void
  alArchivar: (id: string) => void
}) {
  if (encargos.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--tx-ink-primary)]">
          {titulo}
          <span className="text-xs font-normal tabular-nums text-[var(--tx-ink-muted)]">
            {encargos.length}
          </span>
        </h3>
        <p className="text-[11px] text-[var(--tx-ink-muted)]">{ayuda}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {encargos.map((encargo) => (
          <Tarjeta
            key={encargo.id}
            encargo={encargo}
            agente={porId.get(encargo.agenteId)}
            destacado={destacado}
            pendiente={pendiente}
            alAprobar={alAprobar}
            alRechazar={alRechazar}
            alArchivar={alArchivar}
          />
        ))}
      </ul>
    </div>
  )
}

function Tarjeta({
  encargo,
  agente,
  destacado,
  pendiente,
  alAprobar,
  alRechazar,
  alArchivar,
}: {
  encargo: EncargoReal
  agente: AgenteSala | undefined
  destacado: boolean
  pendiente: boolean
  alAprobar: (id: string) => void
  alRechazar: (id: string, motivo: string) => void
  alArchivar: (id: string) => void
}) {
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')

  return (
    <li
      className="flex flex-col gap-2.5 rounded-2xl p-3.5"
      style={{
        border: destacado
          ? '1px solid color-mix(in oklab, var(--tx-warning) 45%, var(--tx-border))'
          : '1px solid var(--tx-border)',
        background: 'var(--tx-surface-1)',
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-0.5 shrink-0 text-[var(--tx-ink-muted)]">
          {encargo.tipo === 'duda' ? <HelpCircle size={14} /> : <Clock size={14} />}
        </span>
        <p className="mr-auto min-w-0 break-words text-sm font-semibold text-[var(--tx-ink-primary)]">
          {encargo.titulo}
        </p>
        {encargo.prioridad === 'alta' && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px]"
            style={{
              color: 'var(--tx-error)',
              background: 'color-mix(in oklab, var(--tx-error) 13%, transparent)',
            }}
          >
            alta
          </span>
        )}
        <Badge variant={encargo.estado === 'rechazado' ? 'destructive' : 'secondary'}>
          {TEXTO_ESTADO[encargo.estado]}
        </Badge>
      </div>

      {encargo.detalle && (
        <p className="whitespace-pre-wrap break-words text-xs text-[var(--tx-ink-secondary)]">
          {encargo.detalle}
        </p>
      )}

      {encargo.respuesta && (
        <div
          className="rounded-xl px-3 py-2"
          style={{ background: 'var(--tx-surface-2)', borderLeft: '3px solid var(--tx-success)' }}
        >
          <p className="text-[11px] text-[var(--tx-ink-muted)]">Respondió {agente?.nombre ?? 'el agente'}:</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[var(--tx-ink-secondary)]">
            {encargo.respuesta}
          </p>
        </div>
      )}

      {encargo.motivoRechazo && (
        <p className="text-xs text-[var(--tx-ink-secondary)]">
          <span className="text-[var(--tx-ink-muted)]">Se rechazó porque:</span>{' '}
          {encargo.motivoRechazo}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[var(--tx-ink-muted)]">
        {agente && (
          <span className="flex items-center gap-1.5">
            <CaraAgente
              nombre={agente.nombre}
              color={agente.color}
              estado={agente.estado}
              agenteId={agente.id}
              tamano={18}
            />
            {agente.nombre}
          </span>
        )}
        {encargo.pedidoPor && <span>lo pidió {encargo.pedidoPor}</span>}
        {encargo.aprobadoPor && <span>lo aprobó {encargo.aprobadoPor}</span>}

        <span className="ml-auto flex flex-wrap gap-1.5">
          {encargo.estado === 'encolado' && !rechazando && (
            <>
              <Button
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                disabled={pendiente}
                onClick={() => alAprobar(encargo.id)}
              >
                <Hand size={12} />
                Dar permiso
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-[11px]"
                disabled={pendiente}
                onClick={() => setRechazando(true)}
              >
                <X size={12} />
                Rechazar
              </Button>
            </>
          )}

          {(encargo.estado === 'respondido' || encargo.estado === 'rechazado') && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11px]"
              disabled={pendiente}
              onClick={() => alArchivar(encargo.id)}
            >
              <Check size={12} />
              Archivar
            </Button>
          )}
        </span>
      </div>

      {rechazando && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué no se hace"
            className="w-full rounded-lg px-2.5 py-1.5 text-xs"
            style={{
              border: '1px solid var(--tx-border)',
              background: 'var(--tx-surface-2)',
              color: 'var(--tx-ink-primary)',
            }}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 text-[11px]"
              disabled={pendiente || motivo.trim().length < 3}
              onClick={() => {
                alRechazar(encargo.id, motivo)
                setRechazando(false)
                setMotivo('')
              }}
            >
              Confirmar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setRechazando(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
