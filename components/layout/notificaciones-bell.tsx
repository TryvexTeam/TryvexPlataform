'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BellIcon, CheckCheckIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { CampanaNotificaciones } from '@/components/layout/campana-notificaciones'
import { PilaNotificaciones } from '@/components/layout/pila-notificaciones'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Notificacion } from '@/lib/repos/notificaciones'

// Nombre único por montaje: supabase-js cachea los canales por nombre y
// removeChannel es asíncrono, así que un remonte reusaba uno ya suscrito y
// agregarle callbacks lanzaba un error que tumbaba la página.
let contadorCanales = 0

/**
 * Dedupe de la carga inicial. El efecto se monta dos veces (StrictMode en dev, y
 * cualquier remonte del topbar) y sin esto se ve `GET /api/notificaciones`
 * abortado + reintento en cada vista. Guardamos la promesa en vuelo y su
 * resultado por una ventana corta: el segundo montaje reusa en vez de refetch.
 */
interface CargaNotis { items: Notificacion[]; integrante_id: string | null }
let promesaEnVuelo: Promise<CargaNotis | null> | null = null
let cacheHasta = 0
const VENTANA_DEDUPE_MS = 10_000

function cargarNotificacionesInicial(): Promise<CargaNotis | null> {
  const ahora = Date.now()
  if (promesaEnVuelo && ahora < cacheHasta) return promesaEnVuelo

  promesaEnVuelo = (async () => {
    try {
      const res = await fetch('/api/notificaciones')
      const json = await res.json()
      if (json.success) {
        return { items: json.data.items as Notificacion[], integrante_id: json.data.integrante_id as string | null }
      }
      return null
    } catch {
      return null
    }
  })()
  cacheHasta = ahora + VENTANA_DEDUPE_MS
  // Al asentar, dejar caducar la promesa para que la próxima montada pida fresco.
  void promesaEnVuelo.finally(() => {
    setTimeout(() => { promesaEnVuelo = null }, VENTANA_DEDUPE_MS)
  })
  return promesaEnVuelo
}

/**
 * Centro de notificaciones del topbar.
 *
 * La bandeja se agrupa por tipo y cada grupo se apila, al modo del centro de
 * notificaciones de iOS: ocho avisos de "tarea asignada" no pueden enterrar el
 * único de "cobro próximo". Cada pila se abre al tocarla y cada tarjeta se
 * descarta deslizándola.
 *
 * Los grupos se ordenan por lo más reciente que contengan, no por tipo fijo:
 * lo que acaba de pasar sube, que es lo que uno viene a mirar.
 *
 * Marcar leídas ocurre al abrir el panel — verlas ES leerlas. Descartar es
 * otra cosa y siempre es explícito.
 */

/** Ventana que separa "hoy" del resto, en horas. */
const HORAS_HOY = 24

interface Grupo {
  clave: string
  tipo: string
  items: Notificacion[]
  masReciente: number
}

/** Agrupa por tipo y ordena por lo más reciente de cada grupo. */
function agrupar(items: Notificacion[]): Grupo[] {
  const porTipo = new Map<string, Notificacion[]>()
  for (const n of items) {
    const lista = porTipo.get(n.tipo)
    if (lista) lista.push(n)
    else porTipo.set(n.tipo, [n])
  }

  return [...porTipo.entries()]
    .map(([tipo, lista]) => ({
      clave: tipo,
      tipo,
      items: lista,
      masReciente: Math.max(...lista.map((n) => new Date(n.created_at).getTime())),
    }))
    .sort((a, b) => b.masReciente - a.masReciente)
}

export function NotificacionesBell() {
  const router = useRouter()
  const [items, setItems] = useState<Notificacion[]>([])
  const [integranteId, setIntegranteId] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  /**
   * Instante que separa "últimas 24 horas" de "anteriores". Se congela al
   * abrir el panel: leerlo del reloj en cada render es impuro, y además haría
   * que un aviso saltara de sección mientras el usuario lo está mirando.
   */
  const [corte, setCorte] = useState(0)
  const sinMovimiento = useReducedMotion()

  const noLeidas = items.filter((n) => !n.leida).length

  // Carga inicial. La función async vive DENTRO del efecto y no fuera: así el
  // estado solo se toca cuando responde el fetch, nunca en el cuerpo del
  // efecto. El AbortController corta la petición si el topbar se desmonta
  // antes de que llegue — sin él, la respuesta tardía escribiría en un
  // componente que ya no existe.
  useEffect(() => {
    let vivo = true

    void cargarNotificacionesInicial().then((datos) => {
      if (!vivo || !datos) return
      setItems(datos.items)
      setIntegranteId(datos.integrante_id)
    })

    return () => { vivo = false }
  }, [])

  // Realtime: las nuevas aparecen sin recargar.
  useEffect(() => {
    if (!integranteId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`notificaciones-bell-${++contadorCanales}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificaciones',
          filter: `integrante_id=eq.${integranteId}`,
        },
        (payload) => setItems((prev) => [payload.new as Notificacion, ...prev].slice(0, 30)),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [integranteId])

  const marcarTodasLeidas = useCallback(async () => {
    if (noLeidas === 0) return
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })))
    await fetch('/api/notificaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {
      /* si falla, la próxima carga devuelve el estado real */
    })
  }, [noLeidas])

  /**
   * Descarta con actualización optimista: la tarjeta se va con el dedo y no
   * después de que responda el servidor — esperar rompería la sensación del
   * gesto. Si el servidor rechaza, vuelven a su sitio y se avisa: perder algo
   * en silencio sería peor que el parpadeo.
   */
  const descartar = useCallback(async (ids: string[]) => {
    const respaldo = items
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)))

    try {
      const res = await fetch('/api/notificaciones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = await res.json().catch(() => ({ success: false }))
      if (!json.success) throw new Error(json.error ?? 'No se pudo descartar')
    } catch (error: unknown) {
      setItems(respaldo)
      toast.error('No se pudo descartar', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }, [items])

  function abrirNotificacion(n: Notificacion) {
    if (n.link) {
      setAbierto(false)
      router.push(n.link)
    }
  }

  const { hoy, anteriores } = useMemo(() => {
    const recientes: Notificacion[] = []
    const viejas: Notificacion[] = []
    for (const n of items) {
      if (new Date(n.created_at).getTime() >= corte) recientes.push(n)
      else viejas.push(n)
    }
    return { hoy: agrupar(recientes), anteriores: agrupar(viejas) }
  }, [items, corte])

  return (
    <DropdownMenu
      open={abierto}
      onOpenChange={(open) => {
        setAbierto(open)
        if (open) {
          setCorte(Date.now() - HORAS_HOY * 3_600_000)
          // Abrir el panel ES verlas: marcarlas leídas aquí evita que el
          // usuario tenga que confirmar que vio lo que acaba de mirar.
          void marcarTodasLeidas()
        }
      }}
    >
      <DropdownMenuTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors
          hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-[var(--tx-accent-2)]"
        style={{ color: abierto ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)' }}
        aria-label={`Notificaciones${noLeidas > 0 ? ` (${noLeidas} sin leer)` : ''}`}
      >
        <CampanaNotificaciones noLeidas={noLeidas} abierto={abierto} />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[26px] border-white/[0.08] p-0"
        style={{ background: 'rgba(17,16,21,.92)', backdropFilter: 'blur(28px) saturate(150%)' }}
      >
        <div className="flex items-center gap-3 px-5 pb-3 pt-4">
          <p className="text-[15px] font-medium tracking-[-0.01em] text-[var(--tx-ink-primary)]">
            Notificaciones
          </p>
          <div className="flex-1" />
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => void descartar(items.map((n) => n.id))}
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--tx-ink-muted)]
                transition-colors hover:text-[var(--tx-ink-primary)]"
            >
              <CheckCheckIcon size={13} aria-hidden="true" />
              Borrar todas
            </button>
          )}
        </div>

        <div className="max-h-[min(560px,70vh)] overflow-y-auto px-3.5 pb-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-4 py-12 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08]">
                <BellIcon size={17} className="text-[var(--tx-ink-muted)]" aria-hidden="true" />
              </span>
              <p className="text-[13px] font-medium text-[var(--tx-ink-primary)]">Todo al día</p>
              <p className="text-[12px] text-[var(--tx-ink-secondary)]">
                Aquí llegan las tareas que te asignen, las citas y los cobros que venzan.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hoy.length > 0 && (
                <section className="flex flex-col gap-2">
                  <p className="px-1 text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                    Últimas 24 horas
                  </p>
                  <AnimatePresence initial={false}>
                    {hoy.map((grupo) => (
                      <motion.div
                        key={grupo.clave}
                        layout={!sinMovimiento}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                      >
                        <PilaNotificaciones
                          tipo={grupo.tipo}
                          items={grupo.items}
                          onAbrir={abrirNotificacion}
                          onDescartar={(ids) => void descartar(ids)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </section>
              )}

              {anteriores.length > 0 && (
                <section className="flex flex-col gap-2">
                  <p className="px-1 text-[11px] font-medium uppercase tracking-[0.09em] text-[var(--tx-ink-muted)]">
                    Anteriores
                  </p>
                  <AnimatePresence initial={false}>
                    {anteriores.map((grupo) => (
                      <motion.div
                        key={grupo.clave}
                        layout={!sinMovimiento}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                      >
                        <PilaNotificaciones
                          tipo={grupo.tipo}
                          items={grupo.items}
                          onAbrir={abrirNotificacion}
                          onDescartar={(ids) => void descartar(ids)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </section>
              )}

              <p className="px-1 pt-1 text-[11px] text-[var(--tx-ink-muted)]">
                Desliza una tarjeta hacia la izquierda para descartarla.
              </p>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
