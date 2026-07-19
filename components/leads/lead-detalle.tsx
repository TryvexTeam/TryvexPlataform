'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Pencil, Trash2, Globe, Phone, MapPin, Star, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LeadForm } from './lead-form'
import { LeadWhatsappPanel } from './lead-whatsapp-panel'
import type { Lead, Interaccion, LeadInsert } from '@/lib/types/lead'
import { ESTADOS_LEAD } from '@/lib/types/lead'
import { cn } from '@/lib/utils'

const tipoIcono: Record<string, string> = {
  whatsapp: '💬', llamada: '📞', instagram: '📸', meet: '🎥', email: '📧', nota: '📝',
}

interface LeadDetalleProps {
  lead: Lead
  initialInteracciones: Interaccion[]
  integranteId: string | null
}

export function LeadDetalle({ lead, initialInteracciones, integranteId }: LeadDetalleProps) {
  const router = useRouter()
  const [interacciones, setInteracciones] = useState<Interaccion[]>(initialInteracciones)
  const [editOpen, setEditOpen] = useState(false)
  const [tipoInteraccion, setTipoInteraccion] = useState<string>('nota')
  const [contenido, setContenido] = useState('')
  const [savingInteraccion, setSavingInteraccion] = useState(false)

  const estadoConf = ESTADOS_LEAD.find((e) => e.id === lead.estado)

  async function handleEdit(data: LeadInsert) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error()
    toast.success('Lead actualizado')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar este lead?')) return
    await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' })
    toast.success('Lead eliminado')
    router.push('/leads')
  }

  async function handleInteraccion() {
    if (!integranteId) return
    setSavingInteraccion(true)
    const res = await fetch('/api/interacciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: lead.id,
        integrante_id: integranteId,
        tipo: tipoInteraccion,
        contenido: contenido || null,
      }),
    })
    if (res.ok) {
      const nueva = await res.json()
      setInteracciones((p) => [nueva, ...p])
      setContenido('')
      toast.success('Interacción registrada')
    } else {
      toast.error('Error al registrar interacción')
    }
    setSavingInteraccion(false)
  }

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 mb-6">
        <ArrowLeft size={14} /> Volver
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--tx-ink-primary)]">{lead.nombre_negocio}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
              <span className="h-2 w-2 rounded-full" style={{ background: estadoConf?.color }} />
              {estadoConf?.label}
            </span>
            {lead.score && (
              <span className="flex items-center gap-0.5 text-xs text-amber-500 font-medium">
                <Star size={11} fill="currentColor" /> {lead.score}/10
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} className="mr-1.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600 hover:text-red-700">
            <Trash2 size={13} />
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-2 mb-6 text-sm">
        {lead.telefono && (
          <span className="flex items-center gap-1.5 text-neutral-600"><Phone size={13} />{lead.telefono}</span>
        )}
        {lead.localidad && (
          <span className="flex items-center gap-1.5 text-neutral-600"><MapPin size={13} />{lead.localidad}</span>
        )}
        {lead.nicho && (
          <span className="text-neutral-600">Nicho: <strong>{lead.nicho}</strong></span>
        )}
        {lead.url_web && (
          <a href={lead.url_web} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-blue-600 hover:underline">
            <Globe size={13} /> Ver web
          </a>
        )}
        <span className="text-neutral-500 capitalize">Origen: {lead.origen}</span>
        <span className="text-neutral-500">
          Creado: {format(new Date(lead.created_at), 'd MMM yyyy', { locale: es })}
        </span>
      </div>

      {lead.notas && (
        <div className="bg-neutral-50 rounded-lg p-3 mb-6 text-sm text-neutral-600">{lead.notas}</div>
      )}

      <Separator className="mb-6" />

      {/* Panel de WhatsApp: hilo + botones de contacto */}
      <LeadWhatsappPanel lead={lead} enviadoPor={integranteId} />

      <Separator className="mb-6" />

      {/* Registrar interacción */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Registrar interacción</h2>
        <div className="flex gap-2 mb-2">
          <Select value={tipoInteraccion} onValueChange={(v) => setTipoInteraccion(v ?? 'nota')}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['whatsapp', 'llamada', 'instagram', 'meet', 'email', 'nota'].map((t) => (
                <SelectItem key={t} value={t}>{tipoIcono[t]} {t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          rows={2}
          placeholder="Contenido de la interacción (opcional)..."
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          className="mb-2"
        />
        <Button size="sm" onClick={handleInteraccion} disabled={savingInteraccion || !integranteId}>
          <MessageSquare size={13} className="mr-1.5" />
          {savingInteraccion ? 'Guardando...' : 'Registrar'}
        </Button>
      </div>

      <Separator className="mb-6" />

      {/* Timeline interacciones */}
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-4">
          Historial ({interacciones.length})
        </h2>
        {interacciones.length === 0 && (
          <p className="text-sm text-neutral-400 text-center py-6">Sin interacciones aún</p>
        )}
        <div className="space-y-3">
          {interacciones.map((i) => (
            <div key={i.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="text-lg leading-none">{tipoIcono[i.tipo]}</span>
                <div className="w-px flex-1 bg-neutral-100 mt-1" />
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium capitalize text-neutral-700">{i.tipo}</span>
                  <span className="text-xs text-neutral-400">
                    {format(new Date(i.created_at), 'd MMM HH:mm', { locale: es })}
                  </span>
                </div>
                {i.contenido && <p className="text-sm text-neutral-600">{i.contenido}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <LeadForm open={editOpen} onOpenChange={setEditOpen} lead={lead} onSubmit={handleEdit} />
    </div>
  )
}
