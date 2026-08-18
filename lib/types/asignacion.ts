import { z } from 'zod'

/**
 * Roles de una asignación.
 *
 * Regla del producto (señor Ignacio, 2026-08-18): el PRIMERO que contacta a un
 * lead queda como `owner`; quien escriba después entra como `colaborador`.
 */
export const ROLES_ASIGNACION = ['owner', 'colaborador'] as const
export type RolAsignacion = (typeof ROLES_ASIGNACION)[number]

/** Fila de `lead_asignaciones` (migración 051). */
export interface LeadAsignacion {
  lead_id: string
  integrante_id: string
  rol: RolAsignacion
  asignado_por: string | null
  created_at: string
}

/** Fila de `eventos_asistentes` tras la 051. */
export interface EventoAsignacion {
  evento_id: string
  integrante_id: string
  rol: RolAsignacion
  asignado_por: string | null
  created_at: string
}

/**
 * Asignación con los datos del integrante, para pintar el stack de avatares
 * en la tarjeta del lead sin una segunda consulta.
 */
export interface AsignacionConIntegrante {
  integrante_id: string
  rol: RolAsignacion
  nombre: string
  avatar_url: string | null
  color: string | null
}

export const asignarSchema = z.object({
  integrante_id: z.string().uuid(),
  rol: z.enum(ROLES_ASIGNACION).default('colaborador'),
})

export const desasignarSchema = z.object({
  integrante_id: z.string().uuid(),
})

export type AsignarPayload = z.infer<typeof asignarSchema>
export type DesasignarPayload = z.infer<typeof desasignarSchema>
