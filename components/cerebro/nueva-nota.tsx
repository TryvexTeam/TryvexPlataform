'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { ENTIDAD_LABEL, type EntradaCerebro } from '@/lib/types/cerebro'
import { Markdown } from '@/components/shared/markdown'

interface EntidadOpcion {
  entidad_tipo: string
  entidad_id: string
  entidad_nombre: string
}

interface NuevaNotaProps {
  entidades: EntidadOpcion[]
  onCreada: (entrada: EntradaCerebro) => void
  children: React.ReactNode
}

/** Nota escrita a mano: lo que la base no puede deducir sola. */
export function NuevaNota({ entidades, onCreada, children }: NuevaNotaProps) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [clave, setClave] = useState('equipo')
  const [guardando, setGuardando] = useState(false)
  const [previsualizando, setPrevisualizando] = useState(false)

  const guardar = async () => {
    if (!titulo.trim()) return
    setGuardando(true)

    const [entidad_tipo, entidad_id] = clave === 'equipo' ? ['equipo', null] : clave.split(':')

    try {
      const res = await fetch('/api/cerebro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entidad_tipo, entidad_id, titulo, contenido: contenido || undefined }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo guardar')

      onCreada(json.data as EntradaCerebro)
      toast.success('Anotado en la bitácora')
      setAbierto(false)
      setTitulo('')
      setContenido('')
      setPrevisualizando(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error guardando la nota')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger render={children as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anotar en la bitácora</DialogTitle>
          <DialogDescription>
            Lo que la base no puede deducir sola: un acuerdo, un motivo, algo que dijo el cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nota-entidad">¿De qué se trata?</Label>
            <select
              id="nota-entidad"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              className="w-full h-9 rounded-md border border-neutral-200 px-3 text-sm bg-transparent"
            >
              {/* La lista desplegable de un <select> nativo la pinta el sistema
                  operativo con fondo blanco, sin importar el tema de la app —
                  bg-transparent solo alcanza al control cerrado. Sin un color
                  de texto explícito, las opciones heredaban el gris claro
                  pensado para el fondo oscuro del modal y quedaban casi
                  invisibles sobre ese blanco nativo. */}
              <option value="equipo" className="text-neutral-900">Equipo (general)</option>
              {entidades.map((e) => (
                <option
                  key={`${e.entidad_tipo}:${e.entidad_id}`}
                  value={`${e.entidad_tipo}:${e.entidad_id}`}
                  className="text-neutral-900"
                >
                  {ENTIDAD_LABEL[e.entidad_tipo as keyof typeof ENTIDAD_LABEL] ?? e.entidad_tipo} — {e.entidad_nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nota-titulo">Título</Label>
            <Input
              id="nota-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Acordamos entregar el 15"
              maxLength={160}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="nota-contenido">Detalle (opcional)</Label>
              {contenido.trim() && (
                <button
                  type="button"
                  onClick={() => setPrevisualizando((v) => !v)}
                  aria-pressed={previsualizando}
                  className="text-[11px] text-[var(--tx-ink-muted)] underline underline-offset-2"
                >
                  {previsualizando ? 'Escribir' : 'Vista previa'}
                </button>
              )}
            </div>

            {previsualizando ? (
              <div className="min-h-[7.5rem] rounded-md border border-neutral-200 px-3 py-2">
                <Markdown>{contenido}</Markdown>
              </div>
            ) : (
              <Textarea
                id="nota-contenido"
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder="Contexto, condiciones, lo que haga falta recordar después."
                rows={5}
              />
            )}
            <p className="text-[11px] text-[var(--tx-ink-muted)]">
              Acepta markdown: **negrita**, listas con `-`, {'>'} citas y [enlaces](https://tryvex.tech).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!titulo.trim() || guardando}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
