'use client'

import { useRef, useState } from 'react'
import { ArrowUpIcon, CameraIcon, PencilIcon, PlusIcon, XIcon } from 'lucide-react'
import { textoPlano } from '@/lib/markdown/mini'
import type { Mensaje } from '@/lib/types/chat'
import { pesoLegible } from '@/lib/types/chat'
import { MAX_ARCHIVOS, validarArchivos } from '@/lib/types/adjuntos'
import { toast } from '@/lib/toast'
import { HojaAdjuntar } from './hoja-adjuntar'

interface ComposerProps {
  cita: Mensaje | null
  nombreCita?: string
  editando: Mensaje | null
  subiendo: { hechos: number; total: number } | null
  onCancelarCita: () => void
  onCancelarEdicion: () => void
  /** Devuelve false si no se pudo aceptar (p. ej. cuerpo demasiado grande): el borrador se conserva. */
  onEnviar: (datos: { contenido: string; archivos: File[] }) => boolean
  onEditar: (mensaje: Mensaje, contenido: string) => Promise<boolean>
  onEscribiendo: () => void
}

const esTactil = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function Composer(props: ComposerProps) {
  const { cita, editando } = props
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [hoja, setHoja] = useState(false)
  const caja = useRef<HTMLTextAreaElement>(null)

  // Al empezar a editar, el campo se llena con el mensaje (ajuste durante el render).
  const [editandoPrevio, setEditandoPrevio] = useState<string | null>(null)
  if ((editando?.id ?? null) !== editandoPrevio) {
    setEditandoPrevio(editando?.id ?? null)
    setTexto(editando?.contenido ?? '')
  }

  const crecer = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 6 * 22 + 12)}px`
  }

  const sumar = (nuevos: File[]) => {
    const problema = validarArchivos([...archivos, ...nuevos].map((f) => ({ nombre: f.name, bytes: f.size })))
    if (problema) return toast.error(problema)
    setArchivos((prev) => [...prev, ...nuevos].slice(0, MAX_ARCHIVOS))
  }

  const hayAlgo = Boolean(texto.trim()) || archivos.length > 0

  const enviar = async () => {
    if (!hayAlgo) return
    if (editando) {
      if (await props.onEditar(editando, texto.trim())) {
        props.onCancelarEdicion()
        setTexto('')
      }
      return
    }
    if (!props.onEnviar({ contenido: texto, archivos })) return
    setTexto('')
    setArchivos([])
    if (caja.current) caja.current.style.height = 'auto'
  }

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (editando) props.onCancelarEdicion()
      else if (cita) props.onCancelarCita()
    }
    // En táctil Enter es salto de línea; en escritorio envía y Shift+Enter salta.
    if (e.key === 'Enter' && !e.shiftKey && !esTactil()) {
      e.preventDefault()
      void enviar()
    }
  }

  return (
    <div className="chat-composer shrink-0 px-2 pt-1.5" style={{ background: 'var(--chat-material)' }}>
      {(cita || editando) && (
        <div className="mb-1.5 flex items-start gap-2 rounded-xl bg-[var(--chat-surface-soft)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[var(--chat-accent)] pl-2 text-[13px]">
            <strong className="flex items-center gap-1 text-[var(--chat-accent)]">
              {editando ? <><PencilIcon className="size-3" /> Editando mensaje</> : (props.nombreCita ?? 'Respondiendo')}
            </strong>
            <span className="line-clamp-2 text-[var(--chat-meta)]">
              {textoPlano((editando ?? cita)?.contenido ?? '') || 'Adjunto'}
            </span>
          </div>
          <button
            onClick={editando ? props.onCancelarEdicion : props.onCancelarCita}
            aria-label={editando ? 'Cancelar edición' : 'Cancelar respuesta'}
            className="grid size-8 shrink-0 place-items-center text-[var(--chat-meta)]"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {archivos.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-2">
          {archivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-[var(--chat-surface-soft)] py-1 pl-2.5 pr-1 text-[12px]">
              <span className="max-w-[160px] truncate">{f.name}</span>
              <span className="text-[var(--chat-meta)]">{pesoLegible(f.size)}</span>
              <button onClick={() => setArchivos((p) => p.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="grid size-7 place-items-center">
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-1.5">
        {!editando && (
          <button onClick={() => setHoja(true)} aria-label="Adjuntar" className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--chat-accent)] active:scale-95">
            <PlusIcon className="size-7" />
          </button>
        )}
        <textarea
          ref={caja}
          value={texto}
          rows={1}
          onChange={(e) => {
            setTexto(e.target.value)
            crecer(e.target)
            props.onEscribiendo()
          }}
          onKeyDown={alTeclear}
          onPaste={(e) => {
            const pegados = Array.from(e.clipboardData.files)
            if (pegados.length === 0) return
            e.preventDefault()
            sumar(pegados)
          }}
          placeholder="Mensaje"
          aria-label="Escribe un mensaje"
          // 16px como mínimo: por debajo iOS hace zoom al enfocar.
          className="min-h-11 flex-1 resize-none rounded-[22px] border border-[var(--chat-separator)] bg-[var(--chat-search)] px-4 py-[10px] text-base leading-[22px] text-[var(--chat-ink)] outline-none"
        />
        {hayAlgo ? (
          <button onClick={() => void enviar()} aria-label={editando ? 'Guardar edición' : 'Enviar mensaje'} className="chat-entra grid size-11 shrink-0 place-items-center rounded-full bg-[var(--chat-accent)] text-[var(--tx-accent-fg)] active:scale-90">
            <ArrowUpIcon className="size-6" strokeWidth={2.6} />
          </button>
        ) : (
          <label aria-label="Cámara" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--chat-accent)] active:scale-95">
            <CameraIcon className="size-6" />
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { sumar(Array.from(e.target.files ?? [])); e.target.value = '' }} />
          </label>
        )}
      </div>

      {props.subiendo && (
        <p className="px-4 pt-1 text-[12px] text-[var(--chat-meta)]" aria-live="polite">
          {props.subiendo.total === 1 ? 'Subiendo el archivo…' : `Subiendo archivos… ${props.subiendo.hechos} de ${props.subiendo.total}`}
        </p>
      )}
      <HojaAdjuntar abierta={hoja} onAbierta={setHoja} onArchivos={sumar} />
    </div>
  )
}
