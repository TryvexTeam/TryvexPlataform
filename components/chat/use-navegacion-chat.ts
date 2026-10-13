'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const BORDE_PX = 20
const PUSH_MS = 350

const esMovil = () => window.innerWidth < 768
const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Navegación lista ↔ conversación, con la conversación en la URL (`?c=<id>`).
 * El atrás del sistema y el gesto vuelven a la lista; el swipe desde el borde
 * izquierdo (20 px) arrastra la pantalla y, pasado 1/3 del ancho, vuelve.
 */
export function useNavegacionChat(inicial?: string) {
  const [activaId, setActivaId] = useState<string | null>(inicial ?? null)
  // La conversación sigue montada mientras sale deslizándose.
  const [mostradaId, setMostradaId] = useState<string | null>(inicial ?? null)
  const [saliendo, setSaliendo] = useState(false)
  const [arrastre, setArrastre] = useState(0)
  const inicio = useRef<{ x: number; y: number } | null>(null)

  if (activaId && activaId !== mostradaId) {
    setMostradaId(activaId)
    setSaliendo(false)
  } else if (!activaId && mostradaId && !saliendo) {
    setSaliendo(true)
  }

  useEffect(() => {
    if (!saliendo) return
    const timer = setTimeout(() => {
      setMostradaId(null)
      setSaliendo(false)
    }, sinMovimiento() ? 0 : PUSH_MS)
    return () => clearTimeout(timer)
  }, [saliendo])

  useEffect(() => {
    const leerUrl = () => setActivaId(new URL(window.location.href).searchParams.get('c'))
    window.addEventListener('popstate', leerUrl)
    return () => window.removeEventListener('popstate', leerUrl)
  }, [])

  useEffect(() => {
    if (activaId) document.documentElement.dataset.chatConversation = 'true'
    else delete document.documentElement.dataset.chatConversation
    return () => {
      delete document.documentElement.dataset.chatConversation
    }
  }, [activaId])

  const abrir = useCallback((id: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('c', id)
    // Cambiar de chat sin pasar por la lista no apila historial: atrás sigue yendo a la lista.
    if (window.history.state?.chatConversation) window.history.replaceState({ chatConversation: true }, '', url)
    else window.history.pushState({ chatConversation: true }, '', url)
    setActivaId(id)
  }, [])

  const volver = useCallback(() => {
    if (window.history.state?.chatConversation) {
      window.history.back()
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete('c')
    window.history.replaceState(null, '', url)
    setActivaId(null)
  }, [])

  const alTocar = (e: React.TouchEvent) => {
    const t = e.touches[0]
    inicio.current = activaId && esMovil() && t.clientX <= BORDE_PX ? { x: t.clientX, y: t.clientY } : null
  }
  const alMover = (e: React.TouchEvent) => {
    if (!inicio.current) return
    const t = e.touches[0]
    const dx = t.clientX - inicio.current.x
    if (dx > 0 && dx > Math.abs(t.clientY - inicio.current.y)) setArrastre(dx)
  }
  const alSoltar = () => {
    if (inicio.current && arrastre > window.innerWidth / 3) volver()
    setArrastre(0)
    inicio.current = null
  }

  return {
    activaId,
    mostradaId,
    saliendo,
    arrastre,
    abrir,
    volver,
    gestosAtras: { onTouchStart: alTocar, onTouchMove: alMover, onTouchEnd: alSoltar, onTouchCancel: alSoltar },
  }
}
