'use client'

import { useTheme } from 'next-themes'
import { Toaster as Sileo } from 'sileo'
import 'sileo/styles.css'

/**
 * Toasts con física (sileo). Reemplaza a sonner; la API la adapta `lib/toast.ts`.
 *
 * Los colores de estado se reasignan a los tokens de Tryvex en `globals.css`
 * (bloque "Sileo adaptado al CRM"): la paleta que trae la librería es la de
 * Tailwind y se leía como una pieza invitada.
 *
 * `roundness: 20` acerca los toasts a la familia de radios del panel (20 en
 * filas, 28 en tarjetas) sin llegar a la píldora, que a este ancho deformaría
 * las esquinas.
 *
 * Abajo a la derecha y no arriba: arriba chocaban con el topbar y tapaban la
 * campana justo cuando algo acaba de pasar, que es cuando uno la mira.
 */
export function Toaster() {
  const { theme = 'dark' } = useTheme()

  return (
    <Sileo
      position="bottom-right"
      theme={theme === 'light' ? 'light' : theme === 'system' ? 'system' : 'dark'}
      offset={{ bottom: 20, right: 20 }}
      options={{ duration: 4000, roundness: 20 }}
    />
  )
}
