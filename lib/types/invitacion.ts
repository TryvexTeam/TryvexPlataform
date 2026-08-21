export interface Invitacion {
  id: string
  email: string
  token_hash: string
  invited_by_id: string
  expires_at: string
  used_at: string | null
  created_at: string
  aprobado_at: string | null
  aprobado_por: string | null
}

export type InvitacionEstado = 'pendiente_aprobacion' | 'pendiente' | 'usado' | 'expirado'

export interface InvitacionConEstado extends Invitacion {
  estado: InvitacionEstado
}

export interface CrearInvitacionInput {
  email: string
}
