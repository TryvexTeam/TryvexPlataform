'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Trash2,
  Sparkles,
  CheckSquare,
  MessageCircle,
  Phone,
  Globe,
  MapPin,
  Tag,
  Loader2,
  Trophy,
  XCircle
} from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Lead, Interaccion } from '@/lib/types/lead'
import { RAZONES_PERDIDA } from '@/lib/types/lead'
import { hashColorHex, getInitials, relativeTime } from '@/lib/utils/lead-utils'
import { LeadChatWa } from './lead-chat-wa'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const estadoConfig: Record<Lead['estado'], { label: string; dot: string }> = {
  sin_contactar:    { label: 'Sin contactar',   dot: 'oklch(63% 0.008 240)' },
  contactado:       { label: 'Contactado',       dot: 'oklch(68% 0.18 230)' },
  interesado:       { label: 'Interesado',       dot: 'oklch(74% 0.17 55)' },
  reunion_agendada: { label: 'Reunión agendada', dot: 'oklch(65% 0.22 292)' },
  ganado:           { label: 'Ganado',           dot: 'oklch(72% 0.17 145)' },
  perdido:          { label: 'Perdido',          dot: 'oklch(63% 0.21 22)' },
  descartado:       { label: 'Descartado',       dot: 'oklch(55% 0.01 240)' },
}

const origenLabels: Record<Lead['origen'], string> = {
  scraper:  'Scraper',
  manual:   'Manual',
  referido: 'Referido',
}

interface LeadPanelProps {
  lead: Lead | null
  interacciones: Interaccion[]
  isTaskPanelOpen: boolean
  onToggleTaskPanel: () => void
  topLeads: Lead[]
}

function LeadAvatar({ initials, accent, size = 36 }: { initials: string; accent: string; size?: number }) {
  const bg = accent === 'gradient'
    ? 'linear-gradient(135deg, #FF8A5B 0%, #C77BF5 55%, #8B5CF6 100%)'
    : `linear-gradient(135deg, ${accent}, ${accent}cc)`
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        boxShadow: '0 6px 16px rgba(0,0,0,.45)',
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

export function LeadPanel({ lead, interacciones, isTaskPanelOpen, onToggleTaskPanel, topLeads }: LeadPanelProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showRazones, setShowRazones] = useState(false)
  // El chat de WhatsApp se abre y cierra con el mismo boton, ahi mismo.
  const [chatAbierto, setChatAbierto] = useState(false)
  const prevLeadId = useRef<string | null>(null)

  // Fade transition when lead changes
  useEffect(() => {
    if (!lead) {
      setVisible(false)
      prevLeadId.current = null
      return
    }
    if (lead.id !== prevLeadId.current) {
      setVisible(false)
      const t = setTimeout(() => {
        setVisible(true)
        prevLeadId.current = lead.id
      }, 80)
      return () => clearTimeout(t)
    }
    setVisible(true)
  }, [lead?.id])

  const updateEstado = async (payload: { estado: Lead['estado']; razon_perdida?: string }, successMsg: string) => {
    if (!lead) return
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(successMsg)
        setShowRazones(false)
        router.refresh()
      } else {
        toast.error('Error al actualizar estado')
      }
    } catch {
      toast.error('Error de red al actualizar')
    } finally {
      setLoading(false)
    }
  }

  const markGanado = () => updateEstado({ estado: 'ganado' }, '🏆 Lead ganado')
  const markPerdido = (razon: string) =>
    updateEstado({ estado: 'perdido', razon_perdida: razon }, 'Lead marcado como perdido')

  const deleteLead = async () => {
    if (!lead) return
    // Toast destructivo — no confirm() nativo
    toast('¿Eliminar este lead?', {
      description: lead.nombre_negocio,
      action: {
        label: 'Eliminar',
        onClick: async () => {
          setLoading(true)
          try {
            const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
            if (res.ok) {
              toast.success('Lead eliminado')
              const params = new URLSearchParams(window.location.search)
              params.delete('lead')
              router.replace(`/leads?${params.toString()}`)
              router.refresh()
            } else {
              toast.error('Error al eliminar')
            }
          } catch {
            toast.error('Error de red al eliminar')
          } finally {
            setLoading(false)
          }
        },
      },
      cancel: { label: 'Cancelar', onClick: () => {} },
    })
  }

  if (!lead) {
    return (
      <section className="glass reader empty flex-1">
        <div className="flex flex-col items-center gap-6 select-none max-w-[420px] px-6 text-center">
          <div>
            <h2
              className="text-[28px] font-semibold leading-tight whitespace-pre-line text-[var(--tx-ink-primary)]"
              style={{ letterSpacing: '-0.03em' }}
            >
              {`Hola, ¿en qué lead\nnecesitas ayuda?`}
            </h2>
            <p className="text-[13px] mt-2 text-[var(--tx-ink-muted)]">
              Selecciona un lead de la lista para continuar
            </p>
          </div>

          {topLeads.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {topLeads.map((tl) => {
                const tlInitials = getInitials(tl.nombre_negocio)
                const tlColor = hashColorHex(tl.nombre_negocio)
                const tlCfg = estadoConfig[tl.estado]
                return (
                  <button
                    key={tl.id}
                    onClick={() => {
                      const params = new URLSearchParams(window.location.search)
                      params.set('lead', tl.id)
                      router.replace(`/leads?${params.toString()}`, { scroll: false })
                    }}
                    className="contact-chip"
                  >
                    <LeadAvatar initials={tlInitials} accent={tlColor} size={24} />
                    <span className="font-medium text-[var(--tx-ink-primary)]">{tl.nombre_negocio}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${tlCfg.dot}22`, color: tlCfg.dot }}
                    >
                      {tlCfg.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>
    )
  }

  const initials = getInitials(lead.nombre_negocio)
  const avatarColor = hashColorHex(lead.nombre_negocio)
  const cfg = estadoConfig[lead.estado]

  return (
    <section
      className="glass reader flex-1 h-full flex flex-col justify-between"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 150ms ease' }}
    >
      {/* Top Bar Actions */}
      <div className="reader__bar">
        <div className="reader__actions">
          <button
            className="icon-btn md:hidden"
            title="Volver a la lista"
            onClick={() => {
              const params = new URLSearchParams(window.location.search)
              params.delete('lead')
              router.replace(`/leads?${params.toString()}`, { scroll: false })
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <button className="icon-btn" title="Eliminar lead" onClick={deleteLead} disabled={loading}>
            <Trash2 size={16} />
          </button>
        </div>

        {!isTaskPanelOpen && (
          <button onClick={onToggleTaskPanel} className="reopen">
            <CheckSquare size={13} />
            <span>Open Tasks</span>
          </button>
        )}
      </div>

      {/* Subject Header — muestra info_texto como heading principal, igual que "Hello, help me v..." en la referencia */}
      <h1 className="reader__subject" style={{ fontSize: 28 }}>
        {lead.info_texto
          ? lead.info_texto.split(' ').slice(0, 9).join(' ') + (lead.info_texto.split(' ').length > 9 ? '...' : '')
          : lead.nombre_negocio}
      </h1>
      {lead.info_texto && (
        <p className="reader__subtitle">{lead.nombre_negocio}</p>
      )}

      {/* Meta bar */}
      <div className="reader__meta">
        <LeadAvatar initials={initials} accent={avatarColor} size={36} />
        <div className="flex-1 min-w-0">
          <div className="reader__from truncate">
            {lead.nombre_negocio}
            {lead.nicho && (
              <> · <span className="text-[var(--tx-ink-muted)] font-normal text-[12px]">{lead.nicho}</span></>
            )}
          </div>
          <div className="reader__to">
            Origen: {origenLabels[lead.origen]}
            {' · '}
            <span className="font-semibold" style={{ color: cfg.dot }}>{cfg.label}</span>
          </div>
        </div>

        {lead.score != null && (
          <div className="reader__hint">
            <Sparkles size={13} />
            <span>Score: <em>{lead.score}/10</em></span>
          </div>
        )}
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="reader__thread flex-1 overflow-y-auto">
        {/* Info card as first thread entry */}
        <article className="msg">
          <header className="msg__head">
            <strong>Datos del Lead</strong>
            <span className="msg__when">Inicial</span>
          </header>
          <div className="msg__to">Canal: {origenLabels[lead.origen]}</div>
          <div className="msg__body space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-3 text-[12px] bg-black/15 p-3 rounded-xl border border-white/[0.04]">
              {lead.telefono && (
                <div className="flex items-center gap-2">
                  <Phone size={12} className="text-[var(--tx-ink-muted)]" />
                  <span className="text-[var(--tx-ink-muted)]">Tel:</span>
                  <span className="text-white truncate font-medium">{lead.telefono}</span>
                </div>
              )}
              {lead.nicho && (
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-[var(--tx-ink-muted)]" />
                  <span className="text-[var(--tx-ink-muted)]">Nicho:</span>
                  <span className="text-white truncate font-medium">{lead.nicho}</span>
                </div>
              )}
              {lead.localidad && (
                <div className="flex items-center gap-2">
                  <MapPin size={12} className="text-[var(--tx-ink-muted)]" />
                  <span className="text-[var(--tx-ink-muted)]">Lugar:</span>
                  <span className="text-white truncate font-medium">{lead.localidad}</span>
                </div>
              )}
              {lead.url_web && (
                <div className="flex items-center gap-2 col-span-2">
                  <Globe size={12} className="text-[var(--tx-ink-muted)]" />
                  <a
                    href={lead.url_web.startsWith('http') ? lead.url_web : `https://${lead.url_web}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--tx-accent-2)] hover:underline truncate font-medium"
                  >
                    {lead.url_web}
                  </a>
                </div>
              )}
            </div>

            {lead.info_texto && (
              <p className="text-[13px] leading-relaxed text-[var(--tx-ink-secondary)] mt-2">
                {lead.info_texto}
              </p>
            )}
          </div>
        </article>

        {/* Interaction thread */}
        {interacciones.length === 0 ? (
          <div className="text-center py-6 text-[12px] text-[var(--tx-ink-muted)] border-t border-dashed border-white/[0.04]">
            Sin interacciones registradas. Usa el panel lateral para agregar contactos.
          </div>
        ) : (
          interacciones.map((int) => {
            const dateLabel = new Date(int.created_at).toLocaleString('es-CL', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })
            const isOutgoing = ['whatsapp', 'llamada', 'email', 'meet'].includes(int.tipo)
            const initialsRep = int.integrante ? getInitials(int.integrante.nombre) : 'CS'
            const repColor = int.integrante ? hashColorHex(int.integrante.nombre) : '#A855F7'

            return (
              <article key={int.id} className={`msg ${isOutgoing ? 'msg--out' : ''}`}>
                <header className="msg__head">
                  <div className="flex items-center gap-2">
                    <LeadAvatar initials={initialsRep} accent={repColor} size={22} />
                    <strong>
                      {int.integrante?.nombre || 'Equipo'} ·{' '}
                      <span className="text-[10.5px] uppercase font-bold text-[var(--tx-accent-2)]">
                        {int.tipo}
                      </span>
                    </strong>
                  </div>
                  <span className="msg__when">{dateLabel}</span>
                </header>
                <div className="msg__to">
                  {lead.nombre_negocio} · {int.respondio ? 'Respondió' : 'Sin respuesta'}
                </div>
                <div className="msg__body">
                  <p>{int.contenido}</p>
                </div>
              </article>
            )
          })
        )}
      </div>

      {/* Action bar */}
      <div className="reply flex flex-col gap-2 mt-4">
        {showRazones && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <span className="text-[var(--tx-ink-muted)] mr-1">¿Por qué se perdió?</span>
            {RAZONES_PERDIDA.map((r) => (
              <button
                key={r.id}
                onClick={() => markPerdido(r.id)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-[var(--tx-ink-secondary)] transition-colors"
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setShowRazones(false)}
              className="px-2 py-1 text-[var(--tx-ink-muted)] hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
        <button
          onClick={markGanado}
          disabled={loading || lead.estado === 'ganado'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border border-green-500/20 bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Trophy size={12} />}
          <span>Ganado</span>
        </button>
        <button
          onClick={() => setShowRazones(true)}
          disabled={loading || lead.estado === 'perdido'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border border-red-500/15 bg-red-500/5 hover:bg-red-500/15 text-red-400 transition-colors disabled:opacity-40"
        >
          <XCircle size={12} />
          <span>Perdido</span>
        </button>
        <button
          onClick={onToggleTaskPanel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.06] text-purple-400 transition-colors"
        >
          <MessageCircle size={12} />
          <span>Registrar Contacto</span>
        </button>
        {lead.telefono && (
          <button
            onClick={() => setChatAbierto((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-colors ${
              chatAbierto
                ? 'border-green-500/30 bg-green-500/15 text-green-300'
                : 'border-green-500/15 bg-green-500/5 hover:bg-green-500/15 text-green-400'
            }`}
          >
            <MessageCircle size={12} />
            <span>{chatAbierto ? 'Cerrar chat' : 'WhatsApp'}</span>
          </button>
        )}

        {lead.notas && (
          <div className="ml-auto text-[12px] max-w-[200px] truncate text-[var(--tx-ink-muted)] italic">
            ✎ {lead.notas}
          </div>
        )}
        </div>

        {/* El chat va en un modal y no desplegado dentro del panel: en el
            celular el panel vive en un contenedor de altura fija con overflow
            oculto, asi que el chat crecia hacia abajo y la caja de texto
            quedaba fuera de la pantalla — se podia leer, no responder.
            A pantalla completa en el telefono; ventana centrada en el escritorio.

            `key` obligatoria: este panel NO se remonta al cambiar de lead (ver
            la transicion de fade con prevLeadId, mas arriba), solo recibe otro
            `lead`. Sin key, React reusa el mismo chat y su estado sobrevive al
            cambio de ficha: el 16-ago-2026 eso dejo cargado en una ficha el
            texto escrito para otra, y por un instante mostraba los mensajes de
            un cliente dentro de la ficha de otro. */}
        {lead.telefono && (
          <Dialog open={chatAbierto} onOpenChange={setChatAbierto}>
            <DialogContent className="flex flex-col gap-0 p-4 max-w-none w-screen h-[100dvh] rounded-none sm:w-full sm:max-w-lg sm:h-[85vh] sm:rounded-xl">
              <DialogTitle className="sr-only">
                Chat de WhatsApp con {lead.nombre_negocio ?? 'este lead'}
              </DialogTitle>
              <LeadChatWa key={lead.id} lead={lead} />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </section>
  )
}
