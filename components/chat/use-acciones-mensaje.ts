'use client'

import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Mensaje } from '@/lib/types/chat'
import { toast } from '@/lib/toast'

export function useAccionesMensaje(
  mensajes: Mensaje[],
  setMensajes: Dispatch<SetStateAction<Mensaje[]>>,
  recargar: (silencioso?: boolean) => Promise<void>,
) {
  const reaccionar = useCallback(async (mensaje: Mensaje, emoji: string) => {
    const actuales = mensaje.reacciones ?? []
    const existente = actuales.find((r) => r.emoji === emoji)
    setMensajes((lista) => lista.map((m) => m.id !== mensaje.id ? m : {
      ...m,
      reacciones: existente
        ? actuales.map((r) => r.emoji === emoji ? { ...r, cuenta: r.cuenta + (r.mia ? -1 : 1), mia: !r.mia } : r).filter((r) => r.cuenta > 0)
        : [...actuales, { emoji, cuenta: 1, mia: true, quienes: ['Tú'] }],
    }))
    const respuesta = await fetch(`/api/chat/mensajes/${mensaje.id}/reacciones`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
    })
    if (!respuesta.ok) { toast.error('No se pudo reaccionar'); await recargar(true) }
  }, [recargar, setMensajes])

  const fijar = useCallback(async (mensaje: Mensaje) => {
    const fijado = !mensaje.fijado_at
    const respuesta = await fetch(`/api/chat/mensajes/${mensaje.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fijar: fijado }),
    })
    const json = await respuesta.json()
    if (!respuesta.ok || !json.success) toast.error(json.error ?? 'No se pudo fijar')
    await recargar(true)
  }, [recargar])

  const eliminar = useCallback(async (mensaje: Mensaje) => {
    const respuesta = await fetch(`/api/chat/mensajes/${mensaje.id}`, { method: 'DELETE' })
    const json = await respuesta.json()
    if (!respuesta.ok || !json.success) { toast.error(json.error ?? 'No se pudo eliminar'); return }
    setMensajes((lista) => lista.map((m) => m.id === mensaje.id ? { ...m, eliminado_at: new Date().toISOString(), contenido: '[mensaje eliminado]' } : m))
  }, [setMensajes])

  const editar = useCallback(async (mensaje: Mensaje, contenido: string) => {
    const respuesta = await fetch(`/api/chat/mensajes/${mensaje.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contenido }),
    })
    const json = await respuesta.json()
    if (!respuesta.ok || !json.success) { toast.error(json.error ?? 'No se pudo editar'); return false }
    setMensajes((lista) => lista.map((m) => m.id === mensaje.id ? { ...m, ...json.data } : m))
    return true
  }, [setMensajes])

  const reenviar = useCallback(async (mensaje: Mensaje, conversaciones: string[]) => {
    const respuesta = await fetch(`/api/chat/mensajes/${mensaje.id}/reenviar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversaciones }),
    })
    const json = await respuesta.json()
    if (!respuesta.ok || !json.success) { toast.error(json.error ?? 'No se pudo reenviar'); return false }
    toast.success('Mensaje reenviado')
    return true
  }, [])

  return { reaccionar, fijar, eliminar, editar, reenviar, mensajes }
}
