'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardPaste, Loader2, Plus, Trash2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Lead } from '@/lib/types/lead'
import type { MensajeHistorial } from '@/lib/repos/historial-manual'
import { leerChatExportado } from '@/lib/leads/importar-chat'
import { abreDiaNuevo } from '@/lib/utils/fecha-santiago'
import { SeparadorDia } from '@/components/shared/separador-dia'

/**
 * La conversación con el lead que pasó fuera del CRM, anotada a mano.
 *
 * Vive en su propia tabla (`lead_historial_manual`): Vex no la lee y el puente
 * no la toca. Si alguien anota algo mal, se borra ahí mismo sin consecuencias
 * para nadie más.
 */

interface Props {
  lead: Lead
  onCerrar: () => void
  /** Cambia cuando otro componente anotó algo: fuerza recargar. */
  version?: number
}

type Direccion = 'in' | 'out'

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })

/** "2026-09-28T16:04" en hora local, que es lo que entiende <input type="datetime-local">. */
function ahoraLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const clave = (m: { direccion: string; texto: string; ocurrido_at: string }) =>
  `${m.direccion}|${m.texto.trim()}|${new Date(m.ocurrido_at).getTime()}`

async function pedirHistorial(leadId: string): Promise<{ data?: MensajeHistorial[]; error?: string }> {
  try {
    const r = await fetch(`/api/leads/${leadId}/historial`, { cache: 'no-store' })
    const d = await r.json()
    return r.ok && d.success ? { data: d.data } : { error: d.error ?? 'No se pudo leer el historial' }
  } catch {
    return { error: 'No se pudo leer el historial' }
  }
}

export function LeadHistorialManual({ lead, onCerrar, version = 0 }: Props) {
  const [mensajes, setMensajes] = useState<MensajeHistorial[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modo, setModo] = useState<'uno' | 'pegar'>('uno')
  const yaAnotados = useMemo(() => new Set(mensajes.map(clave)), [mensajes])

  const aplicar = useCallback((r: { data?: MensajeHistorial[]; error?: string }) => {
    if (r.data) {
      setMensajes(r.data)
      setError(null)
    } else {
      setError(r.error ?? 'No se pudo leer el historial')
    }
    setCargando(false)
  }, [])

  const cargar = useCallback(async () => aplicar(await pedirHistorial(lead.id)), [aplicar, lead.id])

  // Al abrir y cada vez que otro lado anotó algo (`version`). El estado se
  // escribe en el `.then`, no en el cuerpo del efecto, y `vivo` evita escribir
  // sobre un historial de otro lead si la respuesta llega tarde.
  useEffect(() => {
    let vivo = true
    void pedirHistorial(lead.id).then((r) => {
      if (vivo) aplicar(r)
    })
    return () => {
      vivo = false
    }
  }, [aplicar, lead.id, version])

  async function anotar(entradas: Array<{ direccion: Direccion; texto: string; ocurridoAt?: string }>): Promise<boolean> {
    const res = await fetch(`/api/leads/${lead.id}/historial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entradas.length === 1 ? entradas[0] : entradas),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok || !d.success) {
      toast.error(d.error ?? 'No se pudo guardar')
      return false
    }
    await cargar()
    return true
  }

  const [porBorrar, setPorBorrar] = useState<string | null>(null)
  async function borrar(id: string) {
    const res = await fetch(`/api/leads/${lead.id}/historial?entrada=${id}`, { method: 'DELETE' })
    setPorBorrar(null)
    if (!res.ok) {
      toast.error('No se pudo borrar')
      return
    }
    setMensajes((ms) => ms.filter((m) => m.id !== id))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[var(--tx-ink-primary)]">
            Historial de {lead.nombre_negocio ?? 'este lead'}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--tx-ink-muted)]">
            Lo que hablaron fuera del CRM. Solo lo ve el equipo: Vex no lo usa.
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="shrink-0 rounded-lg p-1.5 text-[var(--tx-ink-muted)] hover:bg-white/[0.06] hover:text-[var(--tx-ink-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="min-h-24 flex-1 space-y-2 overflow-y-auto px-1" aria-live="polite">
        {cargando ? (
          <p className="flex items-center gap-2 text-[12px] text-[var(--tx-ink-muted)]">
            <Loader2 size={12} className="animate-spin" /> Cargando…
          </p>
        ) : error ? (
          <p role="alert" className="text-[12px] text-red-400">✗ {error}</p>
        ) : mensajes.length === 0 ? (
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            Todavía no hay nada anotado. Agrega un mensaje abajo o pega un chat exportado de WhatsApp.
          </p>
        ) : (
          mensajes.map((m, i) => {
            const nuestro = m.direccion === 'out'
            return (
              <Fragment key={m.id}>
                {abreDiaNuevo(m.ocurrido_at, mensajes[i - 1]?.ocurrido_at) && <SeparadorDia fecha={m.ocurrido_at} />}
                <div className={`group flex ${nuestro ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] text-[var(--tx-ink-primary)] ${
                      nuestro ? 'border border-green-500/20 bg-green-500/15' : 'border border-white/[0.06] bg-white/[0.05]'
                    }`}
                  >
                    {m.texto}
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-[var(--tx-ink-muted)]">
                      <span>
                        {nuestro ? 'Nosotros' : 'Cliente'} · {hora(m.ocurrido_at)}
                        {m.canal !== 'whatsapp' ? ` · ${m.canal}` : ''}
                        {m.autor ? ` · anotó ${m.autor.split(' ')[0]}` : ''}
                      </span>
                      {porBorrar === m.id ? (
                        <>
                          <button type="button" onClick={() => borrar(m.id)} className="font-semibold text-red-400 underline">
                            Borrar
                          </button>
                          <button type="button" onClick={() => setPorBorrar(null)} className="underline">
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPorBorrar(m.id)}
                          aria-label="Borrar este mensaje del historial"
                          className="rounded p-0.5 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Fragment>
            )
          })
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] pt-3">
        <div role="tablist" aria-label="Cómo anotar" className="mb-2 flex gap-1.5">
          {([
            ['uno', 'Anotar un mensaje', Plus],
            ['pegar', 'Pegar chat exportado', ClipboardPaste],
          ] as const).map(([id, nombre, Icono]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={modo === id}
              onClick={() => setModo(id)}
              className={`flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-colors ${
                modo === id ? 'bg-white/[0.08] text-[var(--tx-ink-primary)]' : 'text-[var(--tx-ink-muted)] hover:bg-white/[0.04]'
              }`}
            >
              <Icono size={12} /> {nombre}
            </button>
          ))}
        </div>
        {modo === 'uno' ? (
          <AnotarUno onAnotar={(e) => anotar([e])} />
        ) : (
          <PegarChat
            nombreLead={lead.nombre_negocio}
            yaAnotados={yaAnotados}
            onImportar={async (es) => {
              const ok = await anotar(es)
              if (ok) {
                toast.success(`${es.length} ${es.length === 1 ? 'mensaje importado' : 'mensajes importados'}`)
                setModo('uno')
              }
              return ok
            }}
          />
        )}
      </div>
    </div>
  )
}

function Quien({ valor, onCambio }: { valor: Direccion; onCambio: (d: Direccion) => void }) {
  return (
    <div role="radiogroup" aria-label="Quién lo escribió" className="flex gap-1.5">
      {([
        ['in', 'El cliente'],
        ['out', 'Nosotros'],
      ] as const).map(([d, nombre]) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={valor === d}
          onClick={() => onCambio(d)}
          className={`min-h-9 rounded-lg border px-3 text-[12px] font-medium transition-colors ${
            valor === d
              ? 'border-green-500/30 bg-green-500/15 text-green-300'
              : 'border-white/[0.06] text-[var(--tx-ink-secondary)] hover:bg-white/[0.04]'
          }`}
        >
          {nombre}
        </button>
      ))}
    </div>
  )
}

function AnotarUno({ onAnotar }: { onAnotar: (e: { direccion: Direccion; texto: string; ocurridoAt?: string }) => Promise<boolean> }) {
  const [direccion, setDireccion] = useState<Direccion>('in')
  const [texto, setTexto] = useState('')
  const [cuando, setCuando] = useState(ahoraLocal)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!texto.trim()) return
    setGuardando(true)
    const instante = new Date(cuando)
    const ok = await onAnotar({
      direccion,
      texto: texto.trim(),
      ...(Number.isNaN(instante.getTime()) ? {} : { ocurridoAt: instante.toISOString() }),
    })
    setGuardando(false)
    if (ok) {
      setTexto('')
      setCuando(ahoraLocal())
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Quien valor={direccion} onCambio={setDireccion} />
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--tx-ink-muted)]">
          Cuándo
          <input
            type="datetime-local"
            value={cuando}
            max={ahoraLocal()}
            onChange={(e) => setCuando(e.target.value)}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[12px] text-[var(--tx-ink-primary)]"
          />
        </label>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          aria-label="Mensaje"
          placeholder={direccion === 'in' ? 'Lo que escribió el cliente…' : 'Lo que le escribimos…'}
          className="min-w-0 flex-1 resize-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[13px] text-[var(--tx-ink-primary)] outline-none placeholder:text-[var(--tx-ink-muted)] focus:border-green-500/30"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={!texto.trim() || guardando}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/10 px-4 text-[12px] font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-40"
        >
          {guardando ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Anotar
        </button>
      </div>
    </div>
  )
}

function PegarChat({
  nombreLead,
  yaAnotados,
  onImportar,
}: {
  nombreLead: string | null
  yaAnotados: Set<string>
  onImportar: (e: Array<{ direccion: Direccion; texto: string; ocurridoAt: string }>) => Promise<boolean>
}) {
  const [crudo, setCrudo] = useState('')
  const [nuestros, setNuestros] = useState<string[] | null>(null)
  const [importando, setImportando] = useState(false)
  const leido = useMemo(() => leerChatExportado(crudo), [crudo])

  // Quién es "nosotros": por defecto, todos los autores menos el que se parece
  // al nombre del lead. Es solo una propuesta; se cambia tocando los nombres.
  const propuesta = useMemo(() => {
    const lead = (nombreLead ?? '').toLowerCase()
    const pareceLead = (a: string) => lead.length > 2 && (lead.includes(a.toLowerCase()) || a.toLowerCase().includes(lead))
    const noLead = leido.autores.filter((a) => !pareceLead(a))
    return noLead.length === leido.autores.length ? leido.autores.slice(0, 1) : noLead
  }, [leido.autores, nombreLead])
  const elegidos = nuestros ?? propuesta

  const entradas = leido.mensajes.map((m) => ({
    direccion: (elegidos.includes(m.autor) ? 'out' : 'in') as Direccion,
    texto: m.texto.slice(0, 4000),
    ocurridoAt: m.ocurridoAt,
  }))
  const nuevas = entradas.filter((e) => !yaAnotados.has(clave({ direccion: e.direccion, texto: e.texto, ocurrido_at: e.ocurridoAt })))

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={crudo}
        onChange={(e) => {
          setCrudo(e.target.value)
          setNuestros(null)
        }}
        rows={4}
        aria-label="Chat exportado de WhatsApp"
        placeholder={'En WhatsApp: el chat → ⋮ → Más → Exportar chat → Sin archivos. Pega aquí el texto.\n28/09/26, 16:04 - Nombre: mensaje…'}
        className="resize-none rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-[11.5px] text-[var(--tx-ink-primary)] outline-none placeholder:font-sans placeholder:text-[var(--tx-ink-muted)] focus:border-green-500/30"
      />
      {crudo.trim() && leido.mensajes.length === 0 && (
        <p role="alert" className="text-[12px] text-red-400">
          ✗ No reconozco un chat exportado: cada mensaje tiene que empezar con fecha y hora, como WhatsApp lo exporta.
        </p>
      )}
      {leido.autores.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-[var(--tx-ink-muted)]">¿Quiénes somos nosotros? Toca para cambiar:</p>
          <div className="flex flex-wrap gap-1.5">
            {leido.autores.map((a) => {
              const nuestro = elegidos.includes(a)
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={nuestro}
                  onClick={() => setNuestros(nuestro ? elegidos.filter((x) => x !== a) : [...elegidos, a])}
                  className={`min-h-8 rounded-full border px-3 text-[12px] ${
                    nuestro ? 'border-green-500/30 bg-green-500/15 text-green-300' : 'border-white/[0.08] text-[var(--tx-ink-secondary)]'
                  }`}
                >
                  {a} · {nuestro ? 'nosotros' : 'cliente'}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {leido.mensajes.length > 0 && (
        <button
          type="button"
          disabled={nuevas.length === 0 || importando}
          onClick={async () => {
            setImportando(true)
            const ok = await onImportar(nuevas.slice(0, 500))
            setImportando(false)
            if (ok) setCrudo('')
          }}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/10 px-4 text-[12px] font-semibold text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-40"
        >
          {importando ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
          {nuevas.length === 0
            ? 'Todo esto ya está anotado'
            : `Importar ${Math.min(nuevas.length, 500)} ${nuevas.length === 1 ? 'mensaje' : 'mensajes'}${
                entradas.length > nuevas.length ? ` (${entradas.length - nuevas.length} ya estaban)` : ''
              }`}
        </button>
      )}
    </div>
  )
}
