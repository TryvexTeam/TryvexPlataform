import type { Jornada } from '@/lib/types/jornada'

/**
 * Qué decirle a alguien cuando marca algo que no calza con su jornada real.
 *
 * Pasa cuando la pantalla quedó desfasada con la base: marcó entrada desde el
 * celular y en el computador seguía el botón "Marcar entrada", o la jornada se
 * cerró sola a las 12 horas (lib/jornada/cierre-automatico.ts) con la pestaña
 * abierta. No es un error de la persona: la API responde 409 con el estado
 * real, el reloj se pone al día y esto explica qué pasó.
 */
export type AccionJornada = 'entrada' | 'salida' | 'pausa' | 'reanudar'

export function explicarConflicto(
  accion: AccionJornada,
  real: Pick<Jornada, 'entrada_at' | 'salida_at' | 'pausas'> | null,
): string {
  if (accion === 'entrada' && real) return 'Ya tenías la jornada abierta. El reloj ya está al día.'
  if (!real) return 'Tu jornada ya estaba cerrada (se cierra sola a las 12 horas). Puedes marcar entrada de nuevo.'
  return 'La pantalla estaba desfasada. El reloj ya está al día.'
}
