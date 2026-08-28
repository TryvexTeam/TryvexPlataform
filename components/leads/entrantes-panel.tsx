'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Loader2, MessageSquarePlus, RefreshCw } from 'lucide-react'
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
  const consultar = useCallback(async (): Promise<EntranteSinIdentificar[] | null> => {
    try {
      const res = await fetch('/api/leads/entrantes', { cache: 'no-store' })
      const cuerpo = await res.json().catch(() => ({}))
      return res.ok && Array.isArray(cuerpo.data) ? cuerpo.data : null
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
    if (datos) setEntrantes(datos)
    setCargando(false)
  }, [consultar])

  // Una consulta al montar para saber si hay algo, y de ahí en más solo
  // mientras el panel esté abierto: sin esto se estaría preguntando al agente
  // cada 30 segundos para una lista que nadie está mirando.
  useEffect(() => {
    let vigente = true
    void consultar().then((datos) => {
      if (!vigente) return
      if (datos) setEntrantes(datos)
      setYaMiro(true)
    })
    return () => {
      vigente = false
    }
  }, [consultar])

  useEffect(() => {
    if (!abierto) return
    const id = setInterval(() => {
      void consultar().then((datos) => datos && setEntrantes(datos))
    }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [abierto, consultar])

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
              El agente no les responde porque nadie del equipo los contactó primero. Creá la ficha
              si es un cliente potencial.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => void refrescar()} disabled={cargando}>
              <RefreshCw size={13} className={cn('mr-1.5', cargando && 'animate-spin')} />
              Actualizar
            </Button>
          </div>

          <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {entrantes.map((e) => (
              <Entrante key={e.conversacion} entrante={e} onCrear={crearLead} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface EntranteProps {
  entrante: EntranteSinIdentificar
  onCrear: (telefono: string, nombre: string | null) => void
}

function Entrante({ entrante, onCrear }: EntranteProps) {
  const ultimoDeEllos = [...entrante.muestra].reverse().find((m) => m.deEllos)

  return (
    <li
      className="flex flex-col gap-2 rounded-lg p-3"
      style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
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
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => onCrear(entrante.telefono, entrante.nombre)}
        >
          <MessageSquarePlus size={13} />
          Crear lead
        </Button>
      </div>

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
