'use client'

import { useId, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useReloj } from '@/lib/vex/usar-reloj'
import type { DemoAgente, leadsParaDemo } from '@/lib/repos/demos'
import type { apagarDemo, crearDemo, sugerirGuionDemo, CrearDemoEntrada } from '@/app/(app)/vex/intelligence/acciones-demos'

interface PanelDemosProps {
  demos: DemoAgente[]
  leads: Awaited<ReturnType<typeof leadsParaDemo>>
  alSugerir: typeof sugerirGuionDemo
  alCrear: typeof crearDemo
  alApagar: typeof apagarDemo
}

const campo = 'min-w-0 w-full rounded-lg px-2.5 py-2 text-sm'
const estiloCampo = {
  border: '1px solid var(--tx-border)',
  background: 'var(--tx-surface-2)',
  color: 'var(--tx-ink-primary)',
}
const etiqueta = 'flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--tx-ink-secondary)]'

export function PanelDemos({ demos, leads, alSugerir, alCrear, alApagar }: PanelDemosProps) {
  const id = useId()
  const ahora = useReloj()
  const [busqueda, setBusqueda] = useState('')
  const [mostrarResultados, setMostrarResultados] = useState(false)
  const [leadId, setLeadId] = useState<string>()
  const [nombreNegocio, setNombreNegocio] = useState('')
  const [telefono, setTelefono] = useState('')
  const [guion, setGuion] = useState('')
  const [horas, setHoras] = useState<CrearDemoEntrada['horas']>(24)
  const [limite, setLimite] = useState('40')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [apagadas, setApagadas] = useState<Set<string>>(new Set())
  const [pendiente, empezar] = useTransition()

  const consulta = busqueda.trim().toLocaleLowerCase('es')
  const resultados = consulta ? leads.filter(l => l.nombre.toLocaleLowerCase('es').includes(consulta)).slice(0, 8) : []
  // El reloj común mueve una demo al historial cuando vence, sin esperar a
  // navegar de nuevo. El cero conserva la foto del servidor al hidratar.
  const actuales = demos.map(d => ({
    ...d,
    activa: d.activa && !apagadas.has(d.id),
    vigente: !apagadas.has(d.id) && (ahora === 0 ? d.vigente :
      d.activa && Date.parse(d.venceAt) > ahora && d.mensajesUsados < d.limiteMensajes),
  }))
  const vigentes = actuales.filter(d => d.vigente)
  const historial = actuales.filter(d => !d.vigente)

  function elegirLead(idLead: string) {
    setError(null)
    setAviso('')
    empezar(async () => {
      try {
        const r = await alSugerir(idLead)
        if (!r.ok) { setError(r.error); return }
        setLeadId(idLead)
        setNombreNegocio(r.nombreNegocio)
        setTelefono(r.telefono)
        setGuion(r.guion)
        setBusqueda(r.nombreNegocio)
        setMostrarResultados(false)
        setAviso('Guion sugerido. Revise y edite los datos antes de activar la demo.')
      } catch {
        setError('No se pudo cargar el guion. Intente nuevamente.')
      }
    })
  }

  function apagar(idDemo: string) {
    setError(null)
    setAviso('')
    empezar(async () => {
      try {
        const r = await alApagar(idDemo)
        if (!r.ok) { setError(r.error); return }
        setApagadas(previas => new Set([...previas, idDemo]))
        setAviso('Demo apagada. El historial se conserva.')
      } catch {
        setError('No se pudo apagar la demo. Intente nuevamente.')
      }
    })
  }

  function tarjeta(d: DemoAgente) {
    return (
      <li key={d.id} className="flex min-w-0 flex-col gap-3 rounded-2xl p-3.5"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-[var(--tx-ink-primary)] [overflow-wrap:anywhere]">{d.nombreNegocio}</h4>
            <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">•••• {d.telefono.slice(-4)}</p>
          </div>
          {/* Una vencida puede seguir activa en la base y reservar el número:
              también se permite apagarla desde el historial para liberarlo. */}
          {d.activa && <Button type="button" variant="outline" size="sm" className="min-h-9"
            disabled={pendiente} aria-label={`Apagar demo de ${d.nombreNegocio}`} onClick={() => apagar(d.id)}>Apagar</Button>}
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-xs text-[var(--tx-ink-muted)]">
          <span>{d.mensajesUsados} / {d.limiteMensajes} mensajes</span>
          <progress className="h-2 w-full min-w-0" style={{ accentColor: 'var(--tx-ink-primary)' }}
            value={Math.min(d.mensajesUsados, d.limiteMensajes)} max={d.limiteMensajes}
            aria-label={`Mensajes usados de ${d.nombreNegocio}`} />
          <span>{!d.activa ? 'Apagada' : d.mensajesUsados >= d.limiteMensajes ? 'Cupo agotado' :
            !d.vigente ? 'Vencida' : ahora === 0 ? 'Calculando vencimiento…' :
              `vence en ${Math.max(0, Math.ceil((Date.parse(d.venceAt) - ahora) / 3_600_000))} h`}</span>
        </div>
        <details className="min-w-0 rounded-lg" style={{ border: '1px solid var(--tx-border)' }}>
          <summary className="cursor-pointer px-3 py-2 text-xs text-[var(--tx-ink-secondary)]">Ver guion</summary>
          <p className="whitespace-pre-wrap px-3 pb-3 text-xs text-[var(--tx-ink-secondary)] [overflow-wrap:anywhere]">{d.guion}</p>
        </details>
      </li>
    )
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 id={`${id}-titulo`} className="text-base font-semibold text-[var(--tx-ink-primary)]">Demos</h2>
        <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">Prepare el asistente de un negocio para que su dueño lo pruebe desde su teléfono.</p>
      </header>

      <form className="flex min-w-0 flex-col gap-3 rounded-2xl p-3.5"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        aria-busy={pendiente}
        onSubmit={e => {
          e.preventDefault()
          setError(null)
          setAviso('')
          empezar(async () => {
            try {
              const r = await alCrear({ leadId, nombreNegocio, telefono, guion, horas, limiteMensajes: Number(limite) })
              if (!r.ok) { setError(r.error); return }
              setLeadId(undefined)
              setBusqueda('')
              setMostrarResultados(false)
              setNombreNegocio('')
              setTelefono('')
              setGuion('')
              setAviso('Demo activada para ese número.')
            } catch {
              setError('No se pudo activar la demo. Intente nuevamente.')
            }
          })
        }}>
        {/* Bloquear la edición durante la sugerencia evita que una respuesta
            tardía sobrescriba lo que la persona acaba de escribir. */}
        <fieldset disabled={pendiente} className="flex min-w-0 flex-col gap-3">
          <legend className="sr-only">Configurar demo</legend>
          <label className={etiqueta}>
            Buscar lead (opcional)
            <input type="search" value={busqueda} className={campo} style={estiloCampo}
              placeholder="Nombre del negocio" autoComplete="off"
              onChange={e => { setBusqueda(e.target.value); setMostrarResultados(true) }} />
          </label>
          {mostrarResultados && consulta && (
            <ul aria-label="Leads encontrados" className="flex min-w-0 flex-col gap-1">
              {resultados.map(l => <li key={l.id} className="min-w-0">
                <button type="button" disabled={pendiente} onClick={() => elegirLead(l.id)}
                  className="min-h-10 w-full rounded-lg px-3 py-2 text-left text-xs text-[var(--tx-ink-primary)] [overflow-wrap:anywhere]"
                  style={{ border: '1px solid var(--tx-border)' }}>{l.nombre}</button>
              </li>)}
              {resultados.length === 0 && <li className="text-xs text-[var(--tx-ink-muted)]">No hay coincidencias. Puede completar los datos manualmente.</li>}
            </ul>
          )}
          {leadId && <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--tx-ink-muted)]">
            <span>Vinculada al lead seleccionado.</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setLeadId(undefined)}>Quitar vínculo</Button>
          </div>}
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <label className={etiqueta}>Nombre del negocio
              <input required maxLength={200} value={nombreNegocio} onChange={e => setNombreNegocio(e.target.value)} className={campo} style={estiloCampo} />
            </label>
            <label className={etiqueta}>Teléfono que probará la demo
              <input required type="tel" inputMode="tel" autoComplete="tel" placeholder="+56 9 8765 2232"
                value={telefono} onChange={e => setTelefono(e.target.value)} className={campo} style={estiloCampo} />
            </label>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <label className={etiqueta}>Duración
              <select value={horas} onChange={e => setHoras(Number(e.target.value) as CrearDemoEntrada['horas'])} className={campo} style={estiloCampo}>
                <option value={24}>24 h</option><option value={72}>3 días</option><option value={168}>7 días</option>
              </select>
            </label>
            <label className={etiqueta}>Límite de mensajes
              <input required type="number" inputMode="numeric" min={1} max={500} step={1}
                value={limite} onChange={e => setLimite(e.target.value)} className={campo} style={estiloCampo} />
            </label>
          </div>
          <label className={etiqueta}>Guion del asistente
            <textarea required rows={8} minLength={50} maxLength={8000} value={guion} onChange={e => setGuion(e.target.value)}
              aria-describedby={`${id}-largo`} className={`${campo} resize-y`} style={estiloCampo} />
          </label>
          <p id={`${id}-largo`} className="text-[11px] text-[var(--tx-ink-muted)]">{guion.length} / 8000 caracteres · mínimo 50</p>
          <Button type="submit" size="sm" className="min-h-10 self-start" disabled={pendiente || guion.trim().length < 50}>
            {pendiente ? 'Procesando…' : 'Activar demo'}
          </Button>
        </fieldset>
      </form>
      <p className="text-xs text-[var(--tx-ink-muted)]">Cuando ese número le escriba al WhatsApp comercial, Vex responde como el asistente de este negocio. Los demás números no cambian.</p>
      {error && <p role="alert" className="text-xs [overflow-wrap:anywhere]" style={{ color: 'var(--tx-error)' }}>{error}</p>}
      <p role="status" className="text-xs text-[var(--tx-ink-secondary)]">{aviso}</p>

      <div className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold text-[var(--tx-ink-primary)]">Vigentes · {vigentes.length}</h3>
        {vigentes.length === 0 && <p className="rounded-2xl p-4 text-center text-xs text-[var(--tx-ink-muted)]" style={{ border: '1px dashed var(--tx-border)' }}>
          No hay demos vigentes. Una demo permite al dueño probar el asistente de su negocio por WhatsApp, solo desde el número elegido y por un tiempo limitado.
        </p>}
        <ul className="flex min-w-0 flex-col gap-2">{vigentes.map(tarjeta)}</ul>
      </div>
      {historial.length > 0 && <details className="min-w-0 rounded-2xl" style={{ border: '1px solid var(--tx-border)' }}>
        <summary className="cursor-pointer px-3.5 py-2.5 text-xs text-[var(--tx-ink-secondary)]">Historial · {historial.length}</summary>
        <ul className="flex min-w-0 flex-col gap-2 p-2.5">{historial.map(tarjeta)}</ul>
      </details>}
    </section>
  )
}
