'use client'

import { useEffect } from 'react'

export function useTecladoIos() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const actualizar = () => {
      document.documentElement.style.setProperty('--chat-viewport-height', `${viewport.height}px`)
      document.documentElement.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`)
      // Con el teclado abierto no hay barra de gestos: el composer no reserva safe-area.
      const abierto = window.innerHeight - viewport.height > 120
      if (abierto) document.documentElement.dataset.chatTeclado = 'true'
      else delete document.documentElement.dataset.chatTeclado
    }
    actualizar()
    viewport.addEventListener('resize', actualizar)
    viewport.addEventListener('scroll', actualizar)
    return () => {
      viewport.removeEventListener('resize', actualizar)
      viewport.removeEventListener('scroll', actualizar)
      document.documentElement.style.removeProperty('--chat-viewport-height')
      document.documentElement.style.removeProperty('--chat-viewport-top')
      delete document.documentElement.dataset.chatTeclado
    }
  }, [])
}
