'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function useNavegacionChat(inicial?: string) {
  const [activaId, setActivaId] = useState<string | null>(inicial ?? null)
  const [arrastre, setArrastre] = useState(0)
  const inicio = useRef<number | null>(null)

  const leerUrl = useCallback(() => {
    setActivaId(new URL(window.location.href).searchParams.get('c'))
  }, [])

  useEffect(() => {
    window.addEventListener('popstate', leerUrl)
    return () => window.removeEventListener('popstate', leerUrl)
  }, [leerUrl])

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
    window.history.pushState({ chatConversation: true }, '', url)
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

  const alPointerDown = (event: React.PointerEvent) => {
    if (event.clientX <= 20 && activaId) inicio.current = event.clientX
  }
  const alPointerMove = (event: React.PointerEvent) => {
    if (inicio.current === null) return
    setArrastre(Math.max(0, event.clientX - inicio.current))
  }
  const alPointerUp = () => {
    if (arrastre > window.innerWidth / 3) volver()
    setArrastre(0)
    inicio.current = null
  }

  return { activaId, abrir, volver, arrastre, alPointerDown, alPointerMove, alPointerUp }
}
