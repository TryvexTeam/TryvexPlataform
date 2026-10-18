'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, MessageSquarePlus, RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { EntranteSinIdentificar } from '@/lib/vex/sin-identificar'

/**
 * Quién le escribió al WhatsApp del equipo sin estar en la base.
 *
 * El agente no le responde a un número desconocido — es lo que evita que
 * conteste a cualquiera. Pero esos mensajes tienen que verse: alguien que
 * escribe y a quien nadie atiende es un cliente potencial que se pierde sin
 * que nadie lo note.
 *
 * Acá el equipo decide. Crear la ficha convierte al desconocido en lead y deja
 * la conversación disponible en su chat; ignorarlo es lo correcto para un
 * proveedor o una equivocación. Ese filtro lo pone una persona a propósito: la
 * alternativa —crear el lead solo, al primer mensaje— es lo que llenó la base
 * de contactos personales cuando se probó con el número de alguien.
 */

/** Cada cuánto se vuelve a mirar, mientras el panel está abierto. */
const REFRESCO_MS = 30000

export function EntrantesPanel() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [entrantes, setEntrantes] = useState<EntranteSinIdentificar[]>([])
  // Cuántas conversaciones activas quedaron sin revisar por el tope del
  // servidor. Se muestra: una bandeja que dice "3" cuando hay 23 esperando da
  // por terminado un trabajo que no lo está.
  const [sinRevisar, setSinRevisar] = useState(0)
  const [cargando, setCargando] = useState(false)
  const [yaMiro, setYaMiro] = useState(false)

  /**
   * Trae la lista y devuelve lo que encontró. No toca estado: quien la llama
   * decide qué hacer con el resultado.
   *
   * Esa separación no es estética. Un `setState` alcanzable de forma síncrona
   * desde un efecto encadena un render sobre otro, y el linter lo marca con
   * razón — así el efecto de montaje solo escribe estado después del `await`.
   */
  const consultar = useCallback(async (): Promise<ResultadoConsulta | null> => {
    try {
      const res = await fetch('/api/leads/entrantes', { cache: 'no-store' })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) return null
      // El endpoint pasó de devolver un arreglo a devolver { entrantes,
      // sinRevisar }. Se aceptan las dos formas para que una pestaña abierta
      // durante el despliegue no se quede en blanco.
      if (Array.isArray(cuerpo.data)) return { entrantes: cuerpo.data, sinRevisar: 0 }
      if (Array.isArray(cuerpo.data?.entrantes)) {
        return {
          entrantes: cuerpo.data.entrantes,
          sinRevisar: Number(cuerpo.data.sinRevisar) || 0,
        }
      }
      return null
    } catch {
      // Es una consulta de fondo: si el agente no responde, la lista se queda
      // con lo último bueno en vez de vaciarse de golpe.
      return null
    }
  }, [])

  /** Refresco manual: acá sí hay spinner, porque lo pidió una persona. */
  const refrescar = useCallback(async () => {
    setCargando(true)
    const datos = await consultar()
    if (datos) {
      setEntrantes(datos.entrantes)
      setSinRevisar(datos.sinRevisar)
    }
    setCargando(false)
  }, [consultar])

  // Una consulta al montar para saber si hay algo, y de ahí en más solo
  // mientras el panel esté abierto: sin esto se estaría preguntando al agente
  // cada 30 segundos para una lista que nadie está mirando.
  useEffect(() => {
    let vigente = true
    void consultar().then((datos) => {
      if (!vigente) return
      if (datos) {
        setEntrantes(datos.entrantes)
        setSinRevisar(datos.sinRevisar)
      }
      setYaMiro(true)
    })
    return () => {
      vigente = false
    }
  }, [consultar])

  useEffect(() => {
    if (!abierto) return
    const id = setInterval(() => {
      void consultar().then((datos) => {
        if (!datos) return
        setEntrantes(datos.entrantes)
        setSinRevisar(datos.sinRevisar)
      })
    }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [abierto, consultar])

  /** Abre la ficha de un candidato del empate, para corregir el dato ahí. */
  const abrirFicha = useCallback(
    (tipo: 'lead' | 'cliente', id: string) => {
      router.push(tipo === 'cliente' ? `/clientes?cliente=${id}` : `/leads?lead=${id}`)
      setAbierto(false)
    },
    [router]
  )

  const crearLead = useCallback(
    (telefono: string, nombre: string | null) => {
      const params = new URLSearchParams({ nuevo: '1', telefono })
      if (nombre) params.set('nombre', nombre)
      router.push(`/leads?${params}`)
      setAbierto(false)
    },
    [router]
  )

  // Sin entrantes no se muestra nada: un botón permanente que casi siempre
  // dice "0" es ruido en una barra donde el espacio importa.
  if (!yaMiro || entrantes.length === 0) return null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setAbierto(true)
          void refrescar()
        }}
        className="gap-1.5"
        style={{ borderColor: 'var(--tx-warning)', color: 'var(--tx-warning)' }}
      >
        <Inbox size={13} />
        {entrantes.length} sin identificar
      </Button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Escribieron y no están en la base</DialogTitle>
            <DialogDescription>
              Escribieron al WhatsApp del equipo y sus mensajes no tienen a qué ficha ir. Los
              nuevos necesitan que se les cree una; los marcados en ámbar tienen el número
              repetido en dos fichas y hay que corregir una.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => void refrescar()} disabled={cargando}>
              <RefreshCw size={13} className={cn('mr-1.5', cargando && 'animate-spin')} />
              Actualizar
            </Button>
          </div>

          {sinRevisar > 0 && (
            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: 'color-mix(in srgb, var(--tx-warning) 12%, transparent)',
                color: 'var(--tx-warning)',
              }}
            >
              Hay {sinRevisar} conversación{sinRevisar === 1 ? '' : 'es'} más que no alcanzamos a
              revisar. Se muestran las más recientes primero.
            </p>
          )}

          <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {entrantes.map((e) => (
              <Entrante key={e.conversacion} entrante={e} onCrear={crearLead} onAbrir={abrirFicha} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Lo que devuelve la consulta: la lista y cuántos quedaron sin mirar. */
interface ResultadoConsulta {
  entrantes: EntranteSinIdentificar[]
  sinRevisar: number
}

interface EntranteProps {
  entrante: EntranteSinIdentificar
  onCrear: (telefono: string, nombre: string | null) => void
  onAbrir: (tipo: 'lead' | 'cliente', id: string) => void
}

function Entrante({ entrante, onCrear, onAbrir }: EntranteProps) {
  const ultimoDeEllos = [...entrante.muestra].reverse().find((m) => m.deEllos)
  const empatado = entrante.motivo === 'ambiguo'

  return (
    <li
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{
        // El empate se pinta distinto: mirar la lista y ver de un vistazo
        // cuáles necesitan una decisión, y no crear una ficha por error.
        border: `1px solid ${empatado ? 'var(--tx-warning)' : 'var(--tx-border)'}`,
        background: 'var(--tx-surface-1)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--tx-ink-primary)] truncate">
            {entrante.nombre?.trim() || entrante.telefono}
          </p>
          <p className="text-xs text-[var(--tx-ink-muted)] tabular-nums">
            {entrante.nombre?.trim() ? `${entrante.telefono} · ` : ''}
            {formatearMomento(entrante.ultimoMensaje)}
          </p>
        </div>
        {!empatado && (
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => onCrear(entrante.telefono, entrante.nombre)}
          >
            <MessageSquarePlus size={13} />
            Crear lead
          </Button>
        )}
      </div>

      {/* Empate: el número está en dos fichas. Crear una tercera empeora el
          problema, así que acá NO se ofrece crear — se ofrece ir a cada una
          para que una persona decida cuál se queda con el número. */}
      {empatado && (
        <div
          className="flex flex-col gap-1.5 rounded p-2"
          style={{ background: 'var(--tx-surface-2)' }}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--tx-warning)]">
            <Users size={12} />
            Este número está en {entrante.candidatos?.length ?? 2} fichas
          </p>
          <p className="text-[11px] text-[var(--tx-ink-muted)]">
            Sus mensajes no se asignan hasta que una quede con el número. Abrí las fichas y
            corregí la que no corresponda.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {entrante.candidatos?.map((c) => (
              <button
                key={`${c.tipo}-${c.id}`}
                type="button"
                onClick={() => onAbrir(c.tipo, c.id)}
                className="rounded px-2 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--tx-surface-1)', border: '1px solid var(--tx-border)' }}
              >
                {c.nombre?.trim() || 'Sin nombre'}
                <span className="ml-1 text-[var(--tx-ink-muted)]">
                  {c.tipo === 'cliente' ? '· cliente' : '· lead'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ultimoDeEllos && (
        <p
          className="text-xs text-[var(--tx-ink-secondary)] rounded p-2 line-clamp-3"
          style={{ background: 'var(--tx-surface-2)' }}
        >
          {ultimoDeEllos.texto}
        </p>
      )}
    </li>
  )
}

/** Cuándo escribió, en lenguaje de persona. */
function formatearMomento(segundos: number | null): string {
  if (!segundos) return 'sin mensajes'

  const minutos = Math.floor((Date.now() - segundos * 1000) / 60000)
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`

  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`

  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`

  return new Date(segundos * 1000).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
