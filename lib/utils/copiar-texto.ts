import { toast } from '@/lib/toast'

/**
 * Copia texto al portapapeles y avisa al usuario del resultado.
 *
 * `navigator.clipboard` solo existe en contexto seguro (https o localhost). En
 * la app siempre lo es, pero un teléfono entrando por IP de red local no lo
 * tiene, y ahí la promesa ni siquiera llega a rechazar: la API es `undefined`.
 * Por eso se comprueba antes en vez de confiar en el `catch`.
 *
 * El respaldo es `execCommand('copy')`, que está obsoleto pero sigue siendo lo
 * único que funciona sin contexto seguro. El textarea va fuera de pantalla y
 * en solo lectura para que no aparezca el teclado del móvil al enfocarlo.
 */
export async function copiarTexto(texto: string, mensajeExito = 'Copiado'): Promise<boolean> {
  if (!texto) return false

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success(mensajeExito)
      return true
    } catch {
      // Permiso denegado o documento sin foco: se intenta el respaldo antes de
      // darlo por perdido.
    }
  }

  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    if (ok) {
      toast.success(mensajeExito)
      return true
    }
  } catch {
    /* sin portapapeles disponible */
  }

  toast.error('No se pudo copiar')
  return false
}
