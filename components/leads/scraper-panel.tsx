'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { describirFiltros, type ScraperRunConAutor } from '@/lib/types/scraper'

/**
 * Traer leads nuevos sin entrar al servidor.
 *
 * El boton no ejecuta nada: deja el pedido escrito y el VPS lo levanta en
 * segundos (ver la migracion 040). Por eso la pantalla no espera una respuesta
 * larga -- confirma al toque y despues va mirando como avanza.
 */

/** Cada cuanto se pregunta como va. Solo mientras hay algo corriendo. */
const CADA_MS = 4000

interface ScraperPanelProps {
  /** Rubros que ya existen en la cartera, para no hacerlos escribir a mano. */
  nichos: string[]
}

export function ScraperPanel({ nichos }: ScraperPanelProps) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState<ScraperRunConAutor | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [form, setForm] = useState({ nicho: '', comuna: '', cantidad: '' })

  // Para avisar cuando TERMINA sin depender de que la persona este mirando.
  const teniaCorrida = useRef(false)

  const mirar = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper')
      if (!res.ok) return
      const json = await res.json()
      const nueva: ScraperRunConAutor | null = json.activa ?? null

      // Paso de "habia una" a "no hay": termino. Recien ahi refrescamos la
      // lista, porque es cuando hay leads nuevos que mostrar.
      if (teniaCorrida.current && !nueva) {
        const ultima: ScraperRunConAutor | undefined = json.historial?.[0]
        if (ultima?.estado === 'lista') {
          toast.success(`Listo: ${ultima.nuevos_leads} leads nuevos`)
        } else if (ultima?.estado === 'frenada') {
          toast.success(`Frenada: alcanzo a traer ${ultima.nuevos_leads}`)
        } else if (ultima?.estado === 'fallida') {
          toast.error(ultima.error ?? 'La busqueda fallo')
        }
        router.refresh()
      }

      teniaCorrida.current = nueva !== null
      setActiva(nueva)
    } catch {
      // Un fallo al preguntar no es un fallo de la corrida: el VPS sigue
      // trabajando aunque esta pestana se quede sin internet un rato.
    }
  }, [router])

  useEffect(() => { void mirar() }, [mirar])

  useEffect(() => {
    if (!activa) return
    const t = setInterval(() => { void mirar() }, CADA_MS)
    return () => clearInterval(t)
  }, [activa, mirar])

  async function buscar() {
    setEnviando(true)
    try {
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicho: form.nicho.trim(),
          comuna: form.comuna.trim(),
          ...(form.cantidad ? { cantidad: Number(form.cantidad) } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'No pude iniciar la busqueda')
        return
      }
      toast.success('Buscando leads...')
      setAbierto(false)
      setForm({ nicho: '', comuna: '', cantidad: '' })
      await mirar()
    } catch {
      toast.error('No pude iniciar la busqueda')
    } finally {
      setEnviando(false)
    }
  }

  async function frenar() {
    if (!activa) return
    try {
      const res = await fetch('/api/scraper', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activa.id }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.error ?? 'No pude frenarla')
        return
      }
      toast.success('Va a parar al terminar el rubro que esta haciendo')
      await mirar()
    } catch {
      toast.error('No pude frenarla')
    }
  }

  // --- corriendo: la pantalla cuenta que pasa, no muestra un boton muerto ---
  if (activa) {
    const total = activa.categorias_totales
    const avance = total ? `${activa.categorias_hechas}/${total}` : null

    return (
      <span
        className="inline-flex items-center gap-2 text-[12px] rounded-lg px-2.5 py-1"
        style={{ background: 'var(--tx-surface-2, rgba(255,255,255,.06))' }}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--tx-accent)' }} />
        <span className="font-semibold">
          {activa.estado === 'encolada' ? 'En cola…' : 'Buscando'}
        </span>
        {activa.categoria_actual && (
          <span style={{ opacity: 0.75 }}>{activa.categoria_actual}</span>
        )}
        {avance && <span style={{ opacity: 0.6 }}>{avance}</span>}
        {activa.nuevos_leads > 0 && (
          <span style={{ opacity: 0.75 }}>+{activa.nuevos_leads}</span>
        )}
        <button
          onClick={frenar}
          disabled={activa.freno_pedido}
          className="ml-1 underline underline-offset-2 disabled:no-underline"
          style={{ opacity: activa.freno_pedido ? 0.5 : 0.8 }}
        >
          {activa.freno_pedido ? 'frenando…' : 'frenar'}
        </button>
      </span>
    )
  }

  // --- libre: el boton ---
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="text-[12px] font-semibold px-2.5 py-1 rounded-lg"
        style={{ background: 'var(--tx-accent)', color: 'var(--tx-accent-fg)' }}
      >
        Buscar más leads
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buscar leads nuevos</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scraper-nicho">Rubro</Label>
              <Input
                id="scraper-nicho"
                list="scraper-nichos"
                value={form.nicho}
                onChange={e => setForm(p => ({ ...p, nicho: e.target.value }))}
                placeholder="Todos los rubros"
              />
              <datalist id="scraper-nichos">
                {nichos.map(n => <option key={n} value={n} />)}
              </datalist>
              <p className="text-[11px]" style={{ opacity: 0.6 }}>
                Elegí uno de la lista o escribí uno nuevo. Vacío busca los 23 de siempre.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scraper-comuna">Comuna</Label>
              <Input
                id="scraper-comuna"
                value={form.comuna}
                onChange={e => setForm(p => ({ ...p, comuna: e.target.value }))}
                placeholder="Toda la Región Metropolitana"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scraper-cantidad">Cuántos traer por rubro</Label>
              <Input
                id="scraper-cantidad"
                type="number"
                min={5}
                max={100}
                value={form.cantidad}
                onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))}
                placeholder="Los de siempre"
              />
              <p className="text-[11px]" style={{ opacity: 0.6 }}>
                Cada resultado se abre en un navegador del servidor: mientras más pidas,
                más tarda. Sobre 100 por rubro la búsqueda se vuelve de horas.
              </p>
            </div>

            <p className="text-[11px]" style={{ opacity: 0.55 }}>
              Se va a buscar: {describirFiltros({
                nicho: form.nicho.trim(),
                comuna: form.comuna.trim(),
                cantidad: form.cantidad ? Number(form.cantidad) : undefined,
              })}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={buscar} disabled={enviando}>
              {enviando ? 'Iniciando…' : 'Buscar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
