'use client'

import { useSyncExternalStore } from 'react'

/**
 * Si la barra inferior del teléfono debe desaparecer.
 *
 * Dos casos, los dos por el teclado:
 *  · Hay una conversación abierta (el chat marca `<html data-chat-conversation>`):
 *    como en WhatsApp, el chat ocupa toda la pantalla.
 *  · Hay un campo de texto con foco. El viewport usa
 *    `interactive-widget=resizes-content`, así que todo lo `fixed bottom-0` sube con
 *    el teclado y queda ENTRE el teclado y el campo. Taparla no basta: hay que
 *    no renderizarla.
 *
 * Se lee del DOM con `useSyncExternalStore` porque ambas señales viven fuera de
 * React (un atributo que pone otro componente y el foco del documento).
 */
const SELECTOR_CAMPO = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, [contenteditable="true"]'

function hayCampoConFoco(): boolean {
  const activo = document.activeElement
  return activo instanceof HTMLElement && activo.matches(SELECTOR_CAMPO)
}

function leer(): boolean {
  return document.documentElement.dataset.chatConversation === 'true' || hayCampoConFoco()
}

function suscribir(avisar: () => void): () => void {
  const observador = new MutationObserver(avisar)
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-chat-conversation'] })
  // Al pasar de un campo a otro, `focusout` llega con el foco todavía en <body>:
  // se espera un cuadro para no hacer parpadear la barra entre campos.
  let cuadro = 0
  const alSalir = () => {
    cancelAnimationFrame(cuadro)
    cuadro = requestAnimationFrame(avisar)
  }
  document.addEventListener('focusin', avisar)
  document.addEventListener('focusout', alSalir)
  return () => {
    observador.disconnect()
    cancelAnimationFrame(cuadro)
    document.removeEventListener('focusin', avisar)
    document.removeEventListener('focusout', alSalir)
  }
}

export function useNavMovilOculta(): boolean {
  return useSyncExternalStore(suscribir, leer, () => false)
}
