'use client'

import { useCallback, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Mensaje, ReaccionAgrupada } from '@/lib/types/chat'
import { toast } from '@/lib/toast'

export function useAccionesMensaje(
  mensajes: Mensaje[],
  setMensajes: Dispatch<SetStateAction<Mensaje[]>>,
  recargar: (silencioso?: boolean) => Promise<void>,
  miNombre = 'Tú',
) {
  const reaccionesEnVuelo = useRef<Set<string>>(new Set())

  const reaccionar = useCallback(
    async (mensaje: Mensaje, emoji: string) => {
      const clave = `${mensaje.id}:${emoji}`
      if (reaccionesEnVuelo.current.has(clave)) return
      reaccionesEnVuelo.current.add(clave)

      const actuales = mensaje.reacciones ?? []
      const existente = actuales.find((r) => r.emoji === emoji)
      const queriaPoner = !existente?.mia

      const aplicar = (invertir: boolean) => {
        setMensajes((prev) =>
          prev.map((m) => {
            if (m.id !== mensaje.id) return m
            const lista = m.reacciones ?? []
            const target = lista.find((r) => r.emoji === emoji)
            const mia = target?.mia ?? false
            const delta = invertir ? (mia ? 1 : -1) : mia ? -1 : 1

            if (target && target.cuenta + delta <= 0) {
              return { ...m, reacciones: lista.filter((r) => r.emoji !== emoji) }
            }

            if (!target) {
              const nueva: ReaccionAgrupada = {
                emoji,
                cuenta: 1,
                mia: true,
                quienes: [miNombre],
              }
              return { ...m, reacciones: [...lista, nueva] }
            }

            return {
              ...m,
              reacciones: lista.map((r) => {
                if (r.emoji !== emoji) return r
                const nuevaMia = !r.mia
                return {
                  ...r,
                  cuenta: r.cuenta + delta,
                  mia: nuevaMia,
                  quienes: nuevaMia ? [...r.quienes, miNombre] : r.quienes.filter((q) => q !== miNombre),
                }
              }),
            }
          }),
        )
      }

      aplicar(false)

      try {
        const res = await fetch(`/api/chat/mensajes/${mensaje.id}/reacciones`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo reaccionar')

        const puesta = (json.data as { puesta?: boolean } | undefined)?.puesta
        if (typeof puesta === 'boolean' && puesta !== queriaPoner) {
          aplicar(true)
          toast.error(puesta ? 'No se pudo quitar la reacción' : 'No se pudo poner la reacción')
        }
      } catch (err) {
        aplicar(true)
        toast.error(err instanceof Error ? err.message : 'Error al reaccionar')
        await recargar(true)
      } finally {
        reaccionesEnVuelo.current.delete(clave)
      }
    },
    [miNombre, recargar, setMensajes],
  )

  const fijar = useCallback(
    async (mensaje: Mensaje) => {
      const fijarVal = !mensaje.fijado_at
      const marca = fijarVal ? new Date().toISOString() : null

      setMensajes((prev) =>
        prev.map((m) => (m.id === mensaje.id ? { ...m, fijado_at: marca } : m)),
      )

      try {
        const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fijar: fijarVal }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo fijar')
        toast.success(fijarVal ? 'Mensaje fijado' : 'Ya no está fijado')
        await recargar(true)
      } catch (err) {
        setMensajes((prev) =>
          prev.map((m) => (m.id === mensaje.id ? { ...m, fijado_at: mensaje.fijado_at } : m)),
        )
        toast.error(err instanceof Error ? err.message : 'Error al fijar')
      }
    },
    [recargar, setMensajes],
  )

  const eliminar = useCallback(
    async (mensaje: Mensaje) => {
      try {
        const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo eliminar')
        setMensajes((prev) =>
          prev.map((m) =>
            m.id === mensaje.id
              ? { ...m, eliminado_at: new Date().toISOString(), contenido: '[mensaje eliminado]' }
              : m,
          ),
        )
        toast.success('Mensaje eliminado')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al eliminar')
      }
    },
    [setMensajes],
  )

  const editar = useCallback(
    async (mensaje: Mensaje, contenido: string) => {
      try {
        const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contenido }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo editar')
        const actualizado = json.data as Mensaje
        setMensajes((prev) => prev.map((m) => (m.id === mensaje.id ? { ...m, ...actualizado } : m)))
        toast.success('Mensaje editado')
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al editar el mensaje')
        return false
      }
    },
    [setMensajes],
  )

  const reenviar = useCallback(
    async (mensaje: Mensaje, conversaciones: string[]) => {
      try {
        const res = await fetch(`/api/chat/mensajes/${mensaje.id}/reenviar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversaciones }),
        })
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo reenviar')
        toast.success('Mensaje reenviado')
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al reenviar')
        return false
      }
    },
    [],
  )

  return { reaccionar, fijar, eliminar, editar, reenviar, mensajes }
}
