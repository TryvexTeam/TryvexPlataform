import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Invitacion, InvitacionConEstado, InvitacionEstado } from '@/lib/types/invitacion'

const EXPIRY_MINUTES = 30
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MINUTES = 60

export function generarToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

function calcularEstado(inv: Invitacion): InvitacionEstado {
  if (inv.used_at) return 'usado'
  if (new Date(inv.expires_at) < new Date()) return 'expirado'
  if (!inv.aprobado_at) return 'pendiente_aprobacion'
  return 'pendiente'
}

/**
 * Quien invita no es siempre quien aprueba: si quien crea la invitación ya
 * es superadmin, se autoaprueba (no tiene sentido pedirle a él mismo que se
 * apruebe). Cualquier otro integrante deja la invitación pendiente hasta
 * que un superadmin la revise desde el panel de aprobación.
 */
export async function crearInvitacion(
  supabase: SupabaseClient,
  email: string,
  invitadoPorId: string,
  invitadorEsSuperadmin: boolean
): Promise<{ invitacion: Invitacion; tokenRaw: string }> {
  const { raw, hash } = generarToken()
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('invitaciones')
    .insert({
      email,
      token_hash: hash,
      invited_by_id: invitadoPorId,
      expires_at: expiresAt,
      aprobado_at: invitadorEsSuperadmin ? new Date().toISOString() : null,
      aprobado_por: invitadorEsSuperadmin ? invitadoPorId : null,
    })
    .select()
    .single()

  if (error) throw error
  return { invitacion: data as Invitacion, tokenRaw: raw }
}

export async function validarToken(
  supabase: SupabaseClient,
  tokenRaw: string
): Promise<{ valido: boolean; invitacion?: Invitacion; error?: string }> {
  const hash = createHash('sha256').update(tokenRaw).digest('hex')

  const { data, error } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('token_hash', hash)
    .single()

  if (error || !data) return { valido: false, error: 'Invitación no encontrada' }

  const inv = data as Invitacion

  if (inv.used_at) return { valido: false, error: 'Esta invitación ya fue utilizada' }
  if (new Date(inv.expires_at) < new Date()) return { valido: false, error: 'La invitación ha expirado' }
  if (!inv.aprobado_at) return { valido: false, error: 'Esta invitación todavía no fue aprobada por un administrador' }

  return { valido: true, invitacion: inv }
}

/** Invitaciones de cualquiera esperando que un superadmin las apruebe. */
export async function getPendientesDeAprobacion(
  supabase: SupabaseClient
): Promise<(InvitacionConEstado & { invitado_por_nombre: string })[]> {
  const { data, error } = await supabase
    .from('invitaciones')
    .select('*, dim_integrantes!invitaciones_invited_by_id_fkey(nombre)')
    .is('aprobado_at', null)
    .gt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as (Invitacion & { dim_integrantes: { nombre: string } | null })[]).map((inv) => ({
    ...inv,
    estado: calcularEstado(inv),
    invitado_por_nombre: inv.dim_integrantes?.nombre ?? 'Alguien',
  }))
}

/** Aprueba una invitación pendiente. Quien llama ya se validó como superadmin en la ruta. */
export async function aprobarInvitacion(
  supabase: SupabaseClient,
  invitacionId: string,
  aprobadoPorId: string
): Promise<Invitacion> {
  const { data, error } = await supabase
    .from('invitaciones')
    .update({ aprobado_at: new Date().toISOString(), aprobado_por: aprobadoPorId })
    .eq('id', invitacionId)
    .is('aprobado_at', null)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('La invitación ya no existe o ya fue aprobada')
  return data as Invitacion
}

export async function marcarUsado(
  supabase: SupabaseClient,
  tokenRaw: string
): Promise<void> {
  const hash = createHash('sha256').update(tokenRaw).digest('hex')
  const { error } = await supabase
    .from('invitaciones')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash)
  if (error) throw error
}

export async function verificarRateLimit(
  supabase: SupabaseClient,
  invitadoPorId: string
): Promise<{ permitido: boolean; restantes: number }> {
  const desde = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('invitaciones')
    .select('*', { count: 'exact', head: true })
    .eq('invited_by_id', invitadoPorId)
    .gte('created_at', desde)

  if (error) throw error

  const total = count ?? 0
  return { permitido: total < RATE_LIMIT_MAX, restantes: RATE_LIMIT_MAX - total }
}

export async function getInvitacionesPorIntegrante(
  supabase: SupabaseClient,
  invitadoPorId: string
): Promise<InvitacionConEstado[]> {
  const { data, error } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('invited_by_id', invitadoPorId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  return (data as Invitacion[]).map((inv) => ({
    ...inv,
    estado: calcularEstado(inv),
  }))
}
