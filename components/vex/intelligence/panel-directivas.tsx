'use client'

import { useState, useTransition } from 'react'
import { Megaphone, Power } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AlcanceDirectiva, Directiva } from '@/lib/repos/directivas'

/**
 * Lo que el equipo decide y todos los agentes tienen que saber.
 *
 * "Este mes hay 20 % de descuento en landings", "no ofrecer IA hasta octubre",
 * "los viernes no se agenda". Se escribe una vez, acá, y lo leen el generador
 * del mensaje en frío y el agente de WhatsApp. Antes cada cambio había que
 * escribirlo en el código de cada agente, y el primero que se olvidaba quedaba
 * diciendo otra cosa.
 *
 * Con fecha de término, una promoción del mes se apaga sola: no queda
 * ofreciéndose en noviembre porque nadie se acordó.
 */

type Resultado = { ok: true } | { ok: false; error: string }

interface PanelDirectivasProps {
  directivas: Directiva[]
  alCrear: (datos: { texto: string; alcance: AlcanceDirectiva; vigenteHasta?: string }) => Promise<Resultado>
  alDesactivar: (id: string) => Promise<Resultado>
}

const TEXTO_ALCANCE: Record<AlcanceDirectiva, string> = {
  todos: 'mensaje en frío y conversaciones',
  primer_mensaje: 'solo el mensaje en frío',
  conversacion: 'solo las conversaciones de WhatsApp',
}

export function PanelDirectivas({ directivas, alCrear, alDesactivar }: PanelDirectivasProps) {
  const [texto, setTexto] = useState('')
  const [alcance, setAlcance] = useState<AlcanceDirectiva>('todos')
  const [hasta, setHasta] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  const vigentes = directivas.filter((d) => d.vigente)
  const historial = directivas.filter((d) => !d.vigente)

  return (
    <section aria-labelledby="titulo-directivas" className="flex flex-col gap-4">
      <header>
        <h2 id="titulo-directivas" className="text-base font-semibold text-[var(--tx-ink-primary)]">
          Directivas
        </h2>
        <p className="mt-1 text-xs text-[var(--tx-ink-muted)]">
          Lo que el equipo decide y todos los agentes tienen que tener en cuenta: promociones,
          cambios de oferta, reglas del momento. Se escribe una vez y lo leen todos.
        </p>
      </header>

      <form
        className="flex flex-col gap-3 rounded-2xl p-3.5"
        style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
        onSubmit={(e) => {
          e.preventDefault()
          empezar(async () => {
            const r = await alCrear({ texto, alcance, vigenteHasta: hasta || undefined })
            if (r.ok) {
              setTexto('')
              setHasta('')
              setError(null)
            } else {
              setError(r.error)
            }
          })
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ej.: "Este mes hay 20 % de descuento en landings. Ofrecerlo solo si el negocio no tiene web."'
          rows={3}
          maxLength={500}
          aria-label="Texto de la directiva"
          className="w-full rounded-lg px-2.5 py-2 text-sm"
          style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)', color: 'var(--tx-ink-primary)' }}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-[var(--tx-ink-muted)]">A qué aplica</span>
            <select
              value={alcance}
              onChange={(e) => setAlcance(e.target.value as AlcanceDirectiva)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs"
              style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)', color: 'var(--tx-ink-primary)' }}
            >
              <option value="todos">Mensaje en frío y conversaciones</option>
              <option value="primer_mensaje">Solo el mensaje en frío</option>
              <option value="conversacion">Solo las conversaciones de WhatsApp</option>
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] text-[var(--tx-ink-muted)]">Vale hasta (opcional)</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full rounded-lg px-2.5 py-1.5 text-xs"
              style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)', color: 'var(--tx-ink-primary)' }}
            />
          </label>
          <Button type="submit" size="sm" disabled={pendiente || texto.trim().length < 5}>
            <Megaphone size={13} className="mr-1.5" />
            Publicar a los agentes
          </Button>
        </div>
        {error && (
          <p className="text-xs" role="alert" style={{ color: 'var(--tx-error)' }}>
            {error}
          </p>
        )}
        <p className="text-[11px] text-[var(--tx-ink-muted)]">
          Si choca con el guion del agente, gana la directiva. Sin fecha de término, vale hasta que
          alguien la apague.
        </p>
      </form>

      <Lista
        titulo="Vigentes"
        ayuda="Esto es lo que los agentes están leyendo hoy."
        directivas={vigentes}
        vacio="No hay directivas vigentes: los agentes trabajan con su guion de siempre."
        pendiente={pendiente}
        alDesactivar={(id) =>
          empezar(async () => {
            const r = await alDesactivar(id)
            setError(r.ok ? null : r.error)
          })
        }
      />

      {historial.length > 0 && (
        <details className="rounded-2xl" style={{ border: '1px solid var(--tx-border)' }}>
          <summary className="cursor-pointer px-3.5 py-2.5 text-xs text-[var(--tx-ink-secondary)]">
            Vencidas o apagadas · {historial.length}
          </summary>
          <div className="p-2.5">
            <Lista titulo="" ayuda="" directivas={historial} vacio="" pendiente={pendiente} />
          </div>
        </details>
      )}
    </section>
  )
}

function Lista({
  titulo,
  ayuda,
  directivas,
  vacio,
  pendiente,
  alDesactivar,
}: {
  titulo: string
  ayuda: string
  directivas: Directiva[]
  vacio: string
  pendiente: boolean
  alDesactivar?: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {titulo && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--tx-ink-primary)]">
            {titulo} <span className="text-xs font-normal tabular-nums text-[var(--tx-ink-muted)]">{directivas.length}</span>
          </h3>
          <p className="text-[11px] text-[var(--tx-ink-muted)]">{ayuda}</p>
        </div>
      )}
      {directivas.length === 0 && vacio && (
        <p className="rounded-2xl p-4 text-center text-xs text-[var(--tx-ink-muted)]" style={{ border: '1px dashed var(--tx-border)' }}>
          {vacio}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {directivas.map((d) => (
          <li
            key={d.id}
            className="flex flex-col gap-2 rounded-2xl p-3.5"
            style={{
              border: '1px solid var(--tx-border)',
              background: 'var(--tx-surface-1)',
              opacity: d.vigente ? 1 : 0.65,
            }}
          >
            <p className="whitespace-pre-wrap break-words text-sm text-[var(--tx-ink-primary)]">{d.texto}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[var(--tx-ink-muted)]">
              <Badge variant="secondary">{TEXTO_ALCANCE[d.alcance]}</Badge>
              <span>
                {d.vigenteHasta ? `hasta el ${d.vigenteHasta.split('-').reverse().join('-')}` : 'sin fecha de término'}
              </span>
              {d.creadoPor && <span>la escribió {d.creadoPor}</span>}
              {!d.activa && <span>apagada</span>}
              {d.vigente && alDesactivar && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 gap-1.5 text-[11px]"
                  disabled={pendiente}
                  onClick={() => alDesactivar(d.id)}
                >
                  <Power size={12} />
                  Apagar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
