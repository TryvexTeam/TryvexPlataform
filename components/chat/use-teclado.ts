'use client'

import { useEffect } from 'react'

export function useTecladoIos() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const actualizar = () => {
      document.documentElement.style.setProperty('--chat-viewport-height', `${viewport.height}px`)
      document.documentElement.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`)
    }
    actualizar()
    viewport.addEventListener('resize', actualizar)
    viewport.addEventListener('scroll', actualizar)
    return () => {
      viewport.removeEventListener('resize', actualizar)
      viewport.removeEventListener('scroll', actualizar)
      document.documentElement.style.removeProperty('--chat-viewport-height')
      document.documentElement.style.removeProperty('--chat-viewport-top')
    }
  }, [])
}
