import type { Mensaje } from '@/lib/types/chat'

export function indicePrimerNoLeido(
  mensajes: Mensaje[],
  ultimoLeidoAt: string,
  miIntegranteId: string,
): number {
  return mensajes.findIndex(
    (mensaje) =>
      !mensaje.hilo_padre &&
      mensaje.autor_id !== miIntegranteId &&
      mensaje.created_at > ultimoLeidoAt,
  )
}

export function cantidadNoLeidosDesde(mensajes: Mensaje[], indice: number): number {
  return indice < 0 ? 0 : mensajes.length - indice
}
