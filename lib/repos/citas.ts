import type { createAdminClient } from '@/lib/supabase/server'
import { DURACION_CITA_MIN } from '@/lib/types/disponibilidad'
import { MAX_RESERVAS_POR_IP_HORA } from '@/lib/types/cita'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

type SB = SupabaseClient<Database>

/** Lo que devuelve el RPC `reservar_cita_publica` (migración 091). */
interface ReservaRow {
  evento_id: string
  lead_id: string
  integrante_id: string
  integrante_nombre: string
}

/** Motivos por los que una reserva se rechaza, ya traducidos desde Postgres. */
export type MotivoRechazo =
  | 'slot_no_disponible'
  | 'hora_no_ofrecida'
  | 'demasiado_pronto'
  | 'demasiado_lejos'
  | 'duracion_invalida'
  | 'consentimiento_faltante'

export class RechazoDeReserva extends Error {
  constructor(readonly motivo: MotivoRechazo) {
    super(motivo)
    this.name = 'RechazoDeReserva'
  }
}

export class CitasRepository {
  private sb: SB

  constructor(supabase: ReturnType<typeof createAdminClient>) {
    this.sb = supabase as SB
  }

  /**
   * Cuántos INTENTOS hizo esta IP en la última hora.
   *
   * Antes contaba filas de `reservas_landing` —solo reservas exitosas—, así que
   * el que probaba mil horas ocupadas y fallaba mil veces nunca tocaba el
   * límite. Ahora cuenta `intentos_reserva_publica`, donde el endpoint registra
   * cada intento válido ANTES de llamar al RPC (migración 093). El freno de la
   * landing vive en memoria del proceso y cada instancia serverless lleva el
   * suyo; contar filas es un freno compartido por todas.
   */
  async superaElLimite(ip: string): Promise<boolean> {
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error } = await this.sb
      .from('intentos_reserva_publica')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('creado_at', desde)
    if (error) throw new Error(error.message)
    return (count ?? 0) >= MAX_RESERVAS_POR_IP_HORA
  }

  /** Deja constancia de un intento de reserva de esta IP, para el rate limit. */
  async registrarIntento(ip: string): Promise<void> {
    const { error } = await this.sb.from('intentos_reserva_publica').insert({ ip })
    if (error) throw new Error(error.message)
  }

  /**
   * Reserva la cita: lead + evento + asistente + registro, todo o nada.
   *
   * El trabajo real lo hace el RPC, que es una transacción: si algo falla a
   * mitad no queda un lead sin evento ni un evento sin nadie asignado. Acá solo
   * se traduce el error de Postgres a algo que el handler pueda convertir en un
   * status HTTP honesto.
   */
  async reservar(input: {
    inicio: string
    nombre: string
    email: string
    telefono: string
    mensaje?: string
    consentimientoVersion: string
    ip: string | null
    userAgent: string | null
  }): Promise<ReservaRow> {
    const { data, error } = await this.sb.rpc('reservar_cita_publica', {
      p_inicio: input.inicio,
      p_duracion_min: DURACION_CITA_MIN,
      p_nombre: input.nombre,
      p_email: input.email,
      p_telefono: input.telefono,
      p_mensaje: input.mensaje ?? null,
      p_consentimiento_version: input.consentimientoVersion,
      p_ip: input.ip,
      p_user_agent: input.userAgent,
    })

    if (error) {
      // El RPC levanta estos tres a propósito, con su ERRCODE. Un rechazo mudo
      // —un error genérico con cuerpo vacío— es indiagnosticable: si se
      // rechaza, se explica.
      const motivos: MotivoRechazo[] = [
        'slot_no_disponible',
        'hora_no_ofrecida',
        'demasiado_pronto',
        'demasiado_lejos',
        'duracion_invalida',
        'consentimiento_faltante',
      ]
      const motivo = motivos.find((m) => error.message.includes(m))
      if (motivo) throw new RechazoDeReserva(motivo)

      // 23P01 = el EXCLUDE de `reservas_landing`. Llega cuando dos reservas
      // simultáneas pasaron ambas la comprobación de disponibilidad y Postgres
      // desempató. Para quien reservó es lo mismo que el slot ocupado.
      if (error.code === '23P01') throw new RechazoDeReserva('slot_no_disponible')

      throw new Error(error.message)
    }

    const fila = (data as ReservaRow[])?.[0]
    if (!fila) throw new Error('El RPC de reserva no devolvió la cita creada')
    return fila
  }

  /** Correo del integrante al que se le asignó la cita, para invitarlo en Google. */
  async emailDeIntegrante(integranteId: string): Promise<string | null> {
    const { data } = await this.sb
      .from('dim_integrantes')
      .select('email')
      .eq('id', integranteId)
      .single()
    return (data as { email: string | null } | null)?.email ?? null
  }

  /** Guarda la referencia de Google en el evento ya creado. */
  async guardarGoogleEnEvento(eventoId: string, googleEventId: string): Promise<void> {
    const { error } = await this.sb
      .from('eventos')
      .update({ google_event_id: googleEventId })
      .eq('id', eventoId)
    if (error) throw new Error(error.message)
  }
}
