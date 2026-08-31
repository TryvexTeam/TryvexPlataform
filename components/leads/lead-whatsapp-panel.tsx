'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageCircle, Send, ExternalLink, Bot } from 'lucide-react'
import { toast } from '@/lib/toast'
import { normalizarTelefono } from '@/lib/vex/telefono'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Lead } from '@/lib/types/lead'
import type { MensajeWa } from '@/lib/types/mensaje-wa'

interface LeadWhatsappPanelProps {
  lead: Lead
  /** Quién está operando (para la atribución del saliente). */
  enviadoPor?: string | null
}

/**
 * Panel de WhatsApp dentro del detalle del lead.
 *  - Botón 1 "Abrir en WhatsApp": abre wa.me con el número del lead y un template
 *    editable. Envío manual (cero riesgo de ban). El template lo mejora Vex.
 *  - Botón 2 "Enviar desde el CRM": llama al puente whatsapp-web.js (POST /api/wa/send).
 *    Se activa cuando ese backend exista; hasta entonces queda deshabilitado.
 *  - Hilo: lee mensajes_wa del lead y muestra entrantes/salientes con atribución.
 */
export function LeadWhatsappPanel({ lead, enviadoPor }: LeadWhatsappPanelProps) {
  const [mensajes, setMensajes] = useState<MensajeWa[]>([])
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  const template = buildTemplate(lead)
  const waNumero = normalizarNumero(lead.telefono)

  useEffect(() => {
    let activo = true
    fetch(`/api/leads/${lead.id}/mensajes`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        if (activo) setMensajes(d.data ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [lead.id])

  function abrirWhatsapp() {
    if (!waNumero) {
      toast.error('Este lead no tiene un número válido')
      return
    }
    const url = `https://wa.me/${waNumero}?text=${encodeURIComponent(template)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    toast.success('Abriendo WhatsApp — revisá y enviá manualmente')
  }

  async function enviarDesdeCrm() {
    if (!waNumero) {
      toast.error('Este lead no tiene un número válido')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          telefono: waNumero,
          texto: template,
          enviado_por: enviadoPor ?? 'JARVIS',
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      toast.success('Mensaje enviado desde el CRM')
    } catch {
      // El backend del Botón 2 (Spike) puede no estar desplegado todavía.
      toast.error('El envío desde el CRM aún no está disponible')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-[var(--tx-ink-primary)] mb-3 flex items-center gap-1.5">
        <MessageCircle size={14} className="text-emerald-600" /> WhatsApp
      </h2>

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          size="sm"
          onClick={abrirWhatsapp}
          disabled={!waNumero}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <ExternalLink size={13} className="mr-1.5" /> Abrir en WhatsApp
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={enviarDesdeCrm}
          disabled={!waNumero || enviando}
        >
          <Send size={13} className="mr-1.5" />
          {enviando ? 'Enviando...' : 'Enviar desde el CRM'}
        </Button>
      </div>

      {/* Template preview */}
      <div className="bg-[var(--tx-surface-1)] border border-[var(--tx-border)] rounded-lg p-3 mb-4 text-xs text-[var(--tx-ink-secondary)] whitespace-pre-wrap">
        {template}
      </div>

      {/* Hilo */}
      <div className="space-y-2">
        {cargando && <p className="text-xs text-[var(--tx-ink-muted)]">Cargando hilo...</p>}
        {!cargando && mensajes.length === 0 && (
          <p className="text-xs text-[var(--tx-ink-muted)]">
            Sin mensajes todavía. Aparecerán acá cuando se envíe o llegue una respuesta.
          </p>
        )}
        {mensajes.map((m) => {
          const saliente = m.direccion === 'out'
          const remitente = saliente
            ? m.es_bot
              ? 'Vex'
              : m.enviado_por || 'Equipo'
            : lead.nombre_negocio || 'Lead'
          return (
            <div
              key={m.id}
              className={cn(
                'flex items-end gap-2',
                saliente ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* Circulito de perfil de quién envió el mensaje */}
              <Avatar className="h-7 w-7 shrink-0" title={remitente}>
                <AvatarFallback
                  className="text-[10px] font-semibold text-white"
                  style={{ background: colorDeNombre(remitente) }}
                >
                  {inicialesDe(remitente)}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                  saliente
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[var(--tx-surface-1)] text-[var(--tx-ink-primary)]'
                )}
              >
                <p className="whitespace-pre-wrap">{m.texto}</p>
                <div
                  className={cn(
                    'mt-1 flex items-center gap-1 text-[10px]',
                    saliente ? 'text-emerald-100' : 'text-[var(--tx-ink-muted)]'
                  )}
                >
                  {saliente && m.es_bot && <Bot size={10} />}
                  <span>{remitente}</span>
                  <span>·</span>
                  <span>{format(new Date(m.created_at), 'HH:mm', { locale: es })}</span>
                  {saliente && m.estado_envio && <span>· {m.estado_envio}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Template inicial de contacto. Vex lo reemplaza con copy personalizada (PAS). */
function buildTemplate(lead: Lead): string {
  const negocio = lead.nombre_negocio ?? 'tu negocio'
  return (
    `Hola 👋 ¿hablo con ${negocio}?\n\n` +
    `Somos Tryvex. Vimos que ${negocio} todavía no tiene sitio web y ayudamos a ` +
    `negocios como el tuyo a conseguir más clientes con una página lista en días. ` +
    `¿Te muestro un ejemplo sin compromiso?`
  )
}

/**
 * Limpia el teléfono a formato wa.me. Delega en `lib/vex/telefono`, que es el
 * mismo criterio que usa el camino de envío: antes había cuatro reglas
 * distintas conviviendo en el repo y no coincidían entre sí, así que la ficha
 * podía mostrar un número y el botón mandar a otro. Este devolvía `digitos`
 * crudo ante cualquier cosa que no fueran 9 dígitos empezando en 9 — o sea que
 * abría wa.me con un número incompleto.
 */
function normalizarNumero(tel: string | null): string | null {
  return normalizarTelefono(tel)
}

/** Iniciales para el circulito de perfil (1-2 letras). */
function inicialesDe(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Color de fondo determinístico por nombre: el mismo remitente siempre tiene su color. */
function colorDeNombre(nombre: string): string {
  const paleta = ['#0a84ff', '#00b4d8', '#1a9f6b', '#c07d15', '#8b5cf6', '#e0653f', '#0d9488']
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0
  return paleta[h % paleta.length]
}
