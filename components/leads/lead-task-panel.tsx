'use client'

import { useState, useEffect } from 'react'
import { CheckSquare, FileText, MessageCircle, X, Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
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

  // 2. Note Form
  const [leadNote, setLeadNote] = useState(lead?.notas || '')

  // Sync note when selected lead changes
  useEffect(() => {
    setLeadNote(lead?.notas || '')
  }, [lead?.id])

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
        {/* Header */}
        <div className="tp__head">
          <div className="tp__app">
            <div
              className="tp__logo"
              style={{
                background: 'linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%)',
              }}
            >
              T
            </div>
            <span>CRM Actions</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('task')}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold text-white"
              style={{ background: '#8B5CF6' }}
            >
              + Crear
            </button>
            <button onClick={onClose} className="icon-btn" aria-label="Close panel">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tp__tabs">
          <button
            onClick={() => setActiveTab('task')}
            className={`tp__tab ${activeTab === 'task' ? 'is-active' : ''}`}
          >
            <CheckSquare size={13} />
            <span>Tarea</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('note')
              setLeadNote(lead.notas || '')
            }}
            className={`tp__tab ${activeTab === 'note' ? 'is-active' : ''}`}
          >
            <FileText size={13} />
            <span>Nota</span>
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`tp__tab ${activeTab === 'contact' ? 'is-active' : ''}`}
          >
            <MessageCircle size={13} />
            <span>Contacto</span>
          </button>
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

            <div className="tp__row">
              <div className="field">
                <span className="field__label">Tipo</span>
                <div className="field__input">
                  <select
                    value={taskType}
                    onChange={e => setTaskType(e.target.value as any)}
                    className="w-full bg-transparent text-[13px] outline-none border-0 text-white"
                  >
                    <option value="general" className="bg-[#111214]">General</option>
                    <option value="feature" className="bg-[#111214]">Feature</option>
                    <option value="error" className="bg-[#111214]">Error</option>
                    <option value="pulir" className="bg-[#111214]">Pulir</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <span className="field__label">Prioridad</span>
                <div className="field__input">
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as any)}
                    className="w-full bg-transparent text-[13px] outline-none border-0 text-white"
                  >
                    <option value="baja" className="bg-[#111214]">Baja</option>
                    <option value="media" className="bg-[#111214]">Media</option>
                    <option value="alta" className="bg-[#111214]">Alta</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="field">
              <span className="field__label">Esfuerzo estimado</span>
              <div className="field__input">
                <select
                  value={taskEffort}
                  onChange={e => setTaskEffort(e.target.value as any)}
                  className="w-full bg-transparent text-[13px] outline-none border-0 text-white"
                >
                  <option value="pequeno" className="bg-[#111214]">Pequeño</option>
                  <option value="medio" className="bg-[#111214]">Medio</option>
                  <option value="grande" className="bg-[#111214]">Grande</option>
                </select>
              </div>
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
            <div className="field">
              <span className="field__label">Canal de Contacto</span>
              <div className="field__input">
                <select
                  value={contactType}
                  onChange={e => setContactType(e.target.value as any)}
                  className="w-full bg-transparent text-[13px] outline-none border-0 text-white"
                >
                  <option value="whatsapp" className="bg-[#111214]">WhatsApp</option>
                  <option value="llamada" className="bg-[#111214]">Llamada</option>
                  <option value="instagram" className="bg-[#111214]">Instagram</option>
                  <option value="email" className="bg-[#111214]">Email</option>
                  <option value="meet" className="bg-[#111214]">Meet / Reunión</option>
                </select>
              </div>
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
