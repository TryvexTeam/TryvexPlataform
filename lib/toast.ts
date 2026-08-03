/**
 * Adaptador de toasts: API con la firma de sonner, motor de sileo (toasts con física).
 * Existe para no reescribir las ~90 llamadas repartidas por la app: los componentes
 * siguen escribiendo `toast.success('Guardado')` y el render lo hace sileo.
 */
import { sileo, type SileoOptions, type SileoState } from 'sileo'

export interface ToastOptions {
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
  /** Sileo tiene un solo botón: el de cancelar se omite y el toast se cierra al expirar. */
  cancel?: { label: string; onClick?: () => void }
  /** Solo por compatibilidad con llamadas viejas de sonner; sileo lo ignora. */
  id?: string
}

function build(mensaje: string, tipo: SileoState, opts?: ToastOptions): SileoOptions {
  return {
    title: mensaje,
    type: tipo,
    description: opts?.description,
    duration: opts?.duration,
    button: opts?.action ? { title: opts.action.label, onClick: opts.action.onClick } : undefined,
  }
}

function base(mensaje: string, opts?: ToastOptions): string {
  // Sin tipo explícito: si trae acción es una confirmación, si no, informativo.
  return sileo.show(build(mensaje, opts?.action ? 'action' : 'info', opts))
}

export const toast = Object.assign(base, {
  success: (mensaje: string, opts?: ToastOptions) => sileo.success(build(mensaje, 'success', opts)),
  error: (mensaje: string, opts?: ToastOptions) => sileo.error(build(mensaje, 'error', opts)),
  warning: (mensaje: string, opts?: ToastOptions) => sileo.warning(build(mensaje, 'warning', opts)),
  info: (mensaje: string, opts?: ToastOptions) => sileo.info(build(mensaje, 'info', opts)),
  loading: (mensaje: string, opts?: ToastOptions) =>
    sileo.show(build(mensaje, 'loading', { ...opts, duration: opts?.duration })),
  dismiss: (id: string) => sileo.dismiss(id),
  clear: () => sileo.clear(),
})
