'use client'

import { useMemo, useState } from 'react'
import { toast } from '@/lib/toast'
import { textoPlano } from '@/lib/markdown/mini'
import { useDatosVivos } from '@/lib/hooks/use-datos-vivos'
import type { Conversacion, Mensaje } from '@/lib/types/chat'
import { avatarConversacion, tituloConversacion } from '@/lib/types/chat'
import { AvatarChat } from './avatar-chat'
import { HiloChat } from './hilo-chat'
import { NuevaConversacion } from './nueva-conversacion'
import { usePresencia } from './use-presencia'
import { useDisponibilidad } from './use-disponibilidad'
import { estadoVisible } from '@/lib/types/presencia'

export interface IntegranteChat {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
}

export interface AgenteChat {
  id: string
  nombre: string
  color: string | null
  avatar_url: string | null
}

interface ChatWorkspaceProps {
  conversacionesIniciales: Conversacion[]
  equipo: IntegranteChat[]
  agentes?: AgenteChat[]
  miIntegranteId: string
  /** Conversación a abrir de entrada (viene del ?c= de una notificación push). */
  conversacionInicialId?: string
}

const FECHA_CORTA = new Intl.DateTimeFormat('es-CL', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Santiago',
})

/** Bandeja + hilo, en dos columnas como el escritorio de Instagram. */
export function ChatWorkspace({
  conversacionesIniciales,
  equipo,
  agentes = [],
  miIntegranteId,
  conversacionInicialId,
}: ChatWorkspaceProps) {
  // El hilo abierto ya escuchaba lo suyo, pero la bandeja no: un mensaje en OTRA
  // conversación no aparecía hasta recargar.
  useDatosVivos(['mensajes', 'conversaciones', 'conversacion_miembros'])

  const idInicial = conversacionInicialId ?? conversacionesIniciales[0]?.id ?? null
  const [conversaciones, setConversaciones] = useState(() =>
    conversacionesIniciales.map((c) => (c.id === idInicial ? { ...c, no_leidos: 0 } : c)),
  )
  const [activaId, setActivaId] = useState<string | null>(idInicial)
  const [abriendo, setAbriendo] = useState(false)
  const enLinea = usePresencia(miIntegranteId)
  // Presence dice "tiene la pestaña abierta"; la disponibilidad sale del turno
  // marcado y del calendario. Se muestran juntas.
  const disponibilidad = useDisponibilidad()

  const activa = useMemo(
    () => conversaciones.find((c) => c.id === activaId) ?? null,
    [conversaciones, activaId],
  )

  // Abrir un hilo lo da por leído. Se hace acá y no en un efecto: es
  // consecuencia del clic, no sincronización con un sistema externo.
  const seleccionar = (id: string) => {
    setActivaId(id)
    setConversaciones((previas) =>
      previas.map((c) => (c.id === id && c.no_leidos > 0 ? { ...c, no_leidos: 0 } : c)),
    )
  }

  const refrescar = async () => {
    try {
      const res = await fetch('/api/chat/conversaciones')
      const json = await res.json()
      if (json.success) setConversaciones(json.data as Conversacion[])
    } catch {
      // La bandeja se reordena en la próxima visita; no vale molestar por esto.
    }
  }

  const alEnviar = (mensaje: Mensaje) => {
    setConversaciones((previas) =>
      [...previas]
        .map((c) =>
          c.id === mensaje.conversacion_id
            ? { ...c, ultimo_mensaje: mensaje, ultimo_mensaje_at: mensaje.created_at }
            : c,
        )
        .sort((a, b) => b.ultimo_mensaje_at.localeCompare(a.ultimo_mensaje_at)),
    )
  }

  const crear = async (payload: { tipo: 'dm' | 'grupo'; nombre?: string; miembros: string[] }) => {
    setAbriendo(true)
    try {
      const res = await fetch('/api/chat/conversaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo crear')

      await refrescar()
      seleccionar(json.data.id as string)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error creando la conversación')
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <div
      className="flex h-full min-h-0 rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      {/* Bandeja. En un teléfono no caben las dos columnas: se muestra esta o el
          hilo, nunca ambas. */}
      <aside
        className={`${activaId ? 'hidden md:flex' : 'flex'} w-full md:w-[300px] shrink-0 flex-col min-h-0`}
        style={{ borderRight: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-[15px] font-semibold text-[var(--tx-ink-primary)]">Mensajes</h2>
          <NuevaConversacion
            equipo={equipo}
            miIntegranteId={miIntegranteId}
            onCrear={crear}
            ocupado={abriendo}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {conversaciones.length === 0 ? (
            <p className="text-sm text-[var(--tx-ink-muted)] px-4 py-6">
              Sin conversaciones todavía. Empieza una con el lápiz de arriba.
            </p>
          ) : (
            conversaciones.map((c) => {
              const titulo = tituloConversacion(c, miIntegranteId)
              const otro = c.miembros.find((m) => m.integrante_id !== miIntegranteId)
              const estadoOtro = otro
                ? estadoVisible(disponibilidad.get(otro.integrante_id), enLinea.has(otro.integrante_id))
                : undefined
              const seleccionada = c.id === activaId

              return (
                <button
                  key={c.id}
                  onClick={() => seleccionar(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                  style={{ background: seleccionada ? 'rgba(255,255,255,0.06)' : 'transparent' }}
                >
                  <AvatarChat
                    nombre={titulo}
                    avatarUrl={avatarConversacion(c, miIntegranteId).url}
                    color={avatarConversacion(c, miIntegranteId).color}
                    estado={c.tipo === 'dm' ? estadoOtro : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[14px] font-medium text-[var(--tx-ink-primary)] truncate">
                        {titulo}
                      </span>
                      <span className="text-[11px] text-[var(--tx-ink-muted)] shrink-0">
                        {FECHA_CORTA.format(new Date(c.ultimo_mensaje_at))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] text-[var(--tx-ink-muted)] truncate">
                        {vistaPrevia(c.ultimo_mensaje)}
                      </span>
                      {c.no_leidos > 0 && (
                        <span
                          className="shrink-0 text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                          style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
                        >
                          {c.no_leidos}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Hilo */}
      <section className={`${activaId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 min-h-0`}>
        {activa ? (
          <HiloChat
            key={activa.id}
            conversacion={activa}
            miIntegranteId={miIntegranteId}
            enLinea={enLinea}
            disponibilidad={disponibilidad}
            agentes={agentes}
            onMensajeEnviado={alEnviar}
            onVolver={() => setActivaId(null)}
          />
        ) : (
          <div className="h-full grid place-items-center text-sm text-[var(--tx-ink-muted)]">
            Elige una conversación
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Qué se lee en la bandeja. Un mensaje que es solo una foto no tiene texto que
 * mostrar, así que se describe; y el markdown va sin sus marcas.
 */
function vistaPrevia(mensaje: Mensaje | null): string {
  if (!mensaje) return 'Sin mensajes'
  if (mensaje.contenido?.trim()) return textoPlano(mensaje.contenido)

  const cuantos = mensaje.adjuntos?.length ?? 0
  if (cuantos === 0) return 'Sin mensajes'
  if (cuantos === 1) {
    return mensaje.adjuntos![0].tipo_mime.startsWith('image/') ? '📷 Imagen' : '📎 Archivo'
  }
  return `📎 ${cuantos} archivos`
}
