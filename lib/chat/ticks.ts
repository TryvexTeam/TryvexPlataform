import type { Mensaje, MiembroChat } from '@/lib/types/chat'

export type EstadoTick = 'pendiente' | 'fallido' | 'enviado' | 'entregado' | 'leido'

export function estadoTicks(
  mensaje: Mensaje,
  miembros: MiembroChat[],
  miIntegranteId: string,
): EstadoTick {
  if (mensaje.envio_estado === 'pendiente') return 'pendiente'
  if (mensaje.envio_estado === 'fallido') return 'fallido'
  const otros = miembros.filter((m) => m.integrante_id !== miIntegranteId)
  if (otros.length === 0) return 'enviado'
  const leyeron = otros.filter((m) => m.ultimo_leido_at >= mensaje.created_at).length
  if (leyeron === otros.length) return 'leido'
  if (leyeron > 0) return 'entregado'
  return 'enviado'
}
