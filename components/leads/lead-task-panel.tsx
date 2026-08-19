'use client'

import { useState } from 'react'
import { CheckSquare, FileText, MessageCircle, X, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRouter } from 'next/navigation'
import type { Lead } from '@/lib/types/lead'

interface LeadTaskPanelProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
}

type TabType = 'task' | 'note' | 'contact'

export function LeadTaskPanel({ lead, isOpen, onClose }: LeadTaskPanelProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('task')
  const [loading, setLoading] = useState(false)

  // Form states
  // 1. Task Form
  const [taskTitle, setTaskTitle] = useState('')
  const [taskType, setTaskType] = useState<'error' | 'feature' | 'pulir' | 'general'>('general')
  const [taskPriority, setTaskPriority] = useState<'alta' | 'media' | 'baja'>('media')
  const [taskEffort, setTaskEffort] = useState<'pequeno' | 'medio' | 'grande'>('medio')

  /*
   * 2. Nota del lead.
   *
   * El borrador viaja junto al lead al que pertenece. Al cambiar de lead, el
   * id deja de coincidir y el campo vuelve a mostrar la nota guardada — sin
   * efecto que sincronice, que era lo que provocaba renders en cascada (y
   * arrastraba lo tecleado de un lead al siguiente si el efecto llegaba tarde).
   */
  const [borradorNota, setBorradorNota] = useState<{ leadId: string; texto: string } | null>(null)
  const leadNote =
    borradorNota !== null && borradorNota.leadId === lead?.id ? borradorNota.texto : (lead?.notas || '')
  const setLeadNote = (texto: string) => {
    if (lead) setBorradorNota({ leadId: lead.id, texto })
  }

  // 3. Contact Form
  const [contactType, setContactType] = useState<'whatsapp' | 'llamada' | 'instagram' | 'meet' | 'email'>('whatsapp')
  const [contactContent, setContactContent] = useState('')
  const [contactResponded, setContactResponded] = useState(true)

  if (!lead) return null

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim()) {
      toast.error('El título es requerido')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/tareas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: taskTitle,
          tipo: taskType,
          prioridad: taskPriority,
          esfuerzo: taskEffort,
          estado: 'sin_empezar',
          lead_id: lead.id,
        }),
      })

      if (res.ok) {
        toast.success('Tarea creada correctamente')
        setTaskTitle('')
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al crear la tarea')
      }
    } catch {
      toast.error('Error de red al crear tarea')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateNote = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: leadNote }),
      })

      if (res.ok) {
        toast.success('Nota del lead actualizada')
        router.refresh()
      } else {
        toast.error('Error al actualizar nota')
      }
    } catch {
      toast.error('Error de red al actualizar nota')
    } finally {
      setLoading(false)
    }
  }

  const handleRecordContact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactContent.trim()) {
      toast.error('El contenido de la interacción es requerido')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/interacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          tipo: contactType,
          contenido: contactContent,
          respondio: contactResponded,
        }),
      })

      if (res.ok) {
        toast.success('Contacto registrado correctamente')
        setContactContent('')
        router.refresh()
      } else {
        toast.error('Error al registrar contacto')
      }
    } catch {
      toast.error('Error de red al registrar contacto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <aside className={`glass-strong task-panel ${isOpen ? 'is-open' : ''}`}>
      <div className="task-panel__inner">
        {/*
         * Cabecera. Antes tenía una "T" en un cuadrado con degradado naranja a
         * morado —una marca que no es la de Tryvex—, el título "CRM Actions" en
         * inglés con el resto del CRM en español, y un botón "+ Crear" morado
         * que solo abría la pestaña de tarea: duplicaba lo que las pestañas de
         * abajo ya hacen, y en un color ajeno al sistema.
         */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--tx-ink-muted)]">
              Añadir a este lead
            </p>
            <p className="mt-1.5 truncate text-[15px] font-medium tracking-[-0.01em] text-[var(--tx-ink-primary)]">
              {lead.nombre_negocio}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border
              border-white/[0.07] text-[var(--tx-ink-muted)] transition-colors
              hover:bg-white/[0.06] hover:text-[var(--tx-ink-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Las tres acciones en un solo carril, como el selector del Panel de
            Mando. La activa va en blanco y no en acento: el rojo se reserva
            para lo que hay que atender, y elegir pestaña no es una alerta. */}
        <div
          role="tablist"
          aria-label="Qué añadir"
          className="mb-5 flex gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1"
        >
          {([
            { id: 'task', label: 'Tarea', Icono: CheckSquare },
            { id: 'note', label: 'Nota', Icono: FileText },
            { id: 'contact', label: 'Contacto', Icono: MessageCircle },
          ] as const).map(({ id, label, Icono }) => {
            const activa = activeTab === id
            return (
              <button
                key={id}
                role="tab"
                aria-selected={activa}
                onClick={() => {
                  setActiveTab(id)
                  if (id === 'note') setLeadNote(lead.notas || '')
                }}
                className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full
                  text-[12.5px] font-medium transition-colors ${
                    activa
                      ? 'bg-white text-[var(--tx-bg-primary)]'
                      : 'text-[var(--tx-ink-secondary)] hover:text-[var(--tx-ink-primary)]'
                  }`}
              >
                <Icono size={13} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>

        {/* Tab Content Panels */}
        {activeTab === 'task' && (
          <form onSubmit={handleCreateTask} className="flex flex-col gap-4 flex-1">
            <div className="field">
              <span className="field__label">Título de la Tarea</span>
              <div className="field__input">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  placeholder="Escribe el título..."
                  required
                />
              </div>
            </div>

            {/* Los selectores son los del sistema, no `<select>` nativos: el
                nativo lo dibuja el sistema operativo, ignora los tokens del
                CRM y cambia de aspecto entre Windows, macOS y Android. */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="block text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                  Tipo
                </label>
                <Select value={taskType} onValueChange={(v) => setTaskType(v as never)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="pulir">Pulir</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 space-y-1.5">
                <label className="block text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                  Prioridad
                </label>
                <Select value={taskPriority} onValueChange={(v) => setTaskPriority(v as never)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="w-full space-y-1.5">
                <label className="block text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                  Esfuerzo estimado
                </label>
                <Select value={taskEffort} onValueChange={(v) => setTaskEffort(v as never)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pequeno">Pequeño</SelectItem>
                    <SelectItem value="medio">Medio</SelectItem>
                    <SelectItem value="grande">Grande</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            <div className="flex-1" />

            <button
              type="submit"
              disabled={loading}
              className="btn btn--primary flex items-center justify-center gap-1.5 w-full"
              style={{
                color: 'var(--tx-accent-fg)',
                background: 'var(--tx-accent)',
                boxShadow: '0 8px 18px oklch(58% 0.24 292 / 30%)',
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
              <span>Crear Tarea</span>
            </button>
          </form>
        )}

        {activeTab === 'note' && (
          <form onSubmit={handleUpdateNote} className="flex flex-col gap-4 flex-1">
            <div className="tp__desc flex-1 flex flex-col">
              <label htmlFor="lead-note">Notas internas del Lead</label>
              <textarea
                id="lead-note"
                value={leadNote}
                onChange={e => setLeadNote(e.target.value)}
                placeholder="Escribe notas, observaciones, estados del negocio..."
              />
              <div className="tp__desc-bar">
                <span className="text-[11px] text-[var(--tx-ink-muted)]">
                  Notas privadas del lead
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn--primary flex items-center justify-center gap-1.5 w-full"
              style={{
                color: 'var(--tx-accent-fg)',
                background: 'var(--tx-accent)',
                boxShadow: '0 8px 18px oklch(58% 0.24 292 / 30%)',
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              <span>Guardar Notas</span>
            </button>
          </form>
        )}

        {activeTab === 'contact' && (
          <form onSubmit={handleRecordContact} className="flex flex-col gap-4 flex-1">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                Canal de contacto
              </label>
              <Select value={contactType} onValueChange={(v) => setContactType(v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meet">Meet / Reunión</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="tp__desc flex-1 flex flex-col">
              <label htmlFor="contact-detail">Detalle de la interacción</label>
              <textarea
                id="contact-detail"
                value={contactContent}
                onChange={e => setContactContent(e.target.value)}
                placeholder="Escribe qué se conversó..."
                required
              />
            </div>

            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="responded"
                checked={contactResponded}
                onChange={e => setContactResponded(e.target.checked)}
                className="w-3.5 h-3.5 accent-[#8B5CF6] rounded"
              />
              <label htmlFor="responded" className="text-[12px] text-[var(--tx-ink-secondary)]">
                El cliente respondió
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn--primary flex items-center justify-center gap-1.5 w-full"
              style={{
                color: 'var(--tx-accent-fg)',
                background: 'var(--tx-accent)',
                boxShadow: '0 8px 18px oklch(58% 0.24 292 / 30%)',
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              <span>Registrar Interacción</span>
            </button>
          </form>
        )}
      </div>
    </aside>
  )
}
