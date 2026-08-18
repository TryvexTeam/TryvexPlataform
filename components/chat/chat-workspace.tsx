'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HeadphonesIcon, MessagesSquareIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLlamadas } from '@/components/llamadas/proveedor-llamadas'
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
  /** Eliminar cualquier mensaje, no solo el propio. */
  soyAdmin?: boolean
  miIntegranteId: string
  /** Conversación a abrir de entrada (viene del ?c= de una notificación push). */
  conversacionInicialId?: string
}

/** Ver `use-datos-vivos`: el nombre del canal debe ser único por montaje. */
let contadorCanal = 0

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
  soyAdmin = false,
  miIntegranteId,
  conversacionInicialId,
}: ChatWorkspaceProps) {
  // El hilo abierto ya escuchaba lo suyo, pero la bandeja no: un mensaje en OTRA
  // conversación no aparecía hasta recargar.
  useDatosVivos(['mensajes', 'conversaciones', 'conversacion_miembros'])

  // Solo se abre un hilo de entrada si vino pedido por `?c=` (una notificación
  // push o un enlace). Antes se abría la primera conversación siempre, y en el
  // teléfono eso significaba entrar al chat y caer de lleno en la última
  // conversación, sin ver nunca la bandeja ni quién más había escrito.
  const idInicial = conversacionInicialId ?? null
  const [conversaciones, setConversaciones] = useState(() =>
    conversacionesIniciales.map((c) => (c.id === idInicial ? { ...c, no_leidos: 0 } : c)),
  )
  const [activaId, setActivaId] = useState<string | null>(idInicial)
  const [enSalas, setEnSalas] = useState<Map<string, string[]>>(() => new Map())
  const [abriendo, setAbriendo] = useState(false)
  const { llamar } = useLlamadas()
  const enLinea = usePresencia(miIntegranteId)
  // Presence dice "tiene la pestaña abierta"; la disponibilidad sale del turno
  // marcado y del calendario. Se muestran juntas.
  const disponibilidad = useDisponibilidad()

  const activa = useMemo(
    () => conversaciones.find((c) => c.id === activaId) ?? null,
    [conversaciones, activaId],
  )

  // Las salas de voz van aparte de los mensajes: son un lugar donde uno entra,
  // no un hilo que uno lee.
  const salas = useMemo(() => conversaciones.filter((c) => c.tipo === 'voz'), [conversaciones])
  const hilos = useMemo(() => conversaciones.filter((c) => c.tipo !== 'voz'), [conversaciones])

  const equipoPorId = useMemo(() => new Map(equipo.map((i) => [i.id, i])), [equipo])

  /**
   * Quién está dentro de cada sala. Se refresca con los cambios de `llamadas`,
   * no con un temporizador: un punto que aparece cinco segundos tarde hace que
   * uno entre a una sala creyendo que hay alguien y se encuentre solo.
   */
  const refrescarSalas = useCallback(async () => {
    try {
      const res = await fetch('/api/llamadas/activas')
      const json = await res.json()
      if (!json.success) return
      const mapa = new Map<string, string[]>()
      for (const fila of json.data as { llamada: { conversacion_id: string }; dentro: string[] }[]) {
        mapa.set(fila.llamada.conversacion_id, fila.dentro)
      }
      setEnSalas(mapa)
    } catch {
      // Sin esto solo se pierde el puntito de "hay gente"; entrar sigue andando.
    }
  }, [])

  useEffect(() => {
    void refrescarSalas()

    const supabase = createClient()
    // Nombre único por montaje: supabase-js cachea los canales por nombre y
    // volver a montar rompe con "cannot add postgres_changes after subscribe".
    const canal = supabase
      .channel(`salas-vivas-${++contadorCanal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamada_participantes' }, () => {
        void refrescarSalas()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamadas' }, () => {
        void refrescarSalas()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [refrescarSalas])

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
          {/* Salas de voz. Van arriba de todo y siempre visibles: son un lugar al
              que se entra, y si hubiera que buscarlas entre los hilos nadie las
              usaría. Igual que en Discord. */}
          {salas.length > 0 && (
            <div className="border-b border-[var(--border)] py-2">
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-ink-muted)]">
                Salas de voz
              </p>
              {salas.map((sala) => {
                const dentro = enSalas.get(sala.id) ?? []
                return (
                  <button
                    key={sala.id}
                    onClick={() => llamar(sala.id, { titulo: sala.nombre ?? 'Sala de voz' })}
                    className="w-full px-4 py-2 text-left transition-colors hover:bg-[oklch(100%_0_0_/_4%)]"
                  >
                    <span className="flex items-center gap-2">
                      <HeadphonesIcon
                        className="size-4 shrink-0"
                        style={{ color: dentro.length > 0 ? 'var(--tx-accent)' : 'var(--tx-ink-muted)' }}
                      />
                      <span className="flex-1 truncate text-[14px] font-medium text-[var(--tx-ink-primary)]">
                        {sala.nombre ?? 'Sala de voz'}
                      </span>
                      {dentro.length > 0 && (
                        <span className="text-[11px] tabular-nums text-[var(--tx-accent)]">{dentro.length}</span>
                      )}
                    </span>

                    {/* Los nombres de quienes están dentro, no solo el número: en un
                        equipo de cinco, saber QUIÉN está es la mitad de la decisión
                        de entrar. */}
                    {dentro.length > 0 && (
                      <span className="mt-1 block pl-6 text-[12px] text-[var(--tx-ink-muted)] truncate">
                        {dentro
                          .map((id) => equipoPorId.get(id)?.nombre ?? 'Alguien')
                          .join(', ')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {hilos.length === 0 ? (
            <p className="text-sm text-[var(--tx-ink-muted)] px-4 py-6">
              Sin conversaciones todavía. Empieza una con el lápiz de arriba.
            </p>
          ) : (
            hilos.map((c) => {
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
                          {/* Con tope: "47" en una píldora chica no se lee y no
                              aporta nada sobre "9+". Lo que importa es que hay
                              varios sin leer. */}
                          {c.no_leidos > 9 ? '9+' : c.no_leidos}
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
            soyAdmin={soyAdmin}
            onMensajeEnviado={alEnviar}
            onVolver={() => setActivaId(null)}
          />
        ) : (
          // Un panel vacio y gris con una frase de instruccion se siente a
          // error. Un icono apagado del mismo lenguaje visual del chat, sin
          // caja ni borde, pesa mucho menos en la pantalla.
          // w-full: la section es flex-row y sin esto el div solo ocupaba el
          // ancho de su contenido, quedando pegado a la izquierda (al lado
          // de la lista) en vez de centrarse en toda la caja.
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--tx-ink-muted)]">
            <MessagesSquareIcon size={32} strokeWidth={1.5} className="opacity-40" />
            <p className="text-[13px]">Elige una conversación para empezar</p>
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
