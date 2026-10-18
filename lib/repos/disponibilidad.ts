import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type { Celda, DisponibilidadIntegrante, SlotPublico } from '@/lib/types/disponibilidad'
import { calcularSlots, type CeldaOfrecida, type Ocupacion } from '@/lib/citas/slots'
import { sumarDias } from '@/lib/utils/fecha-santiago'

/**
 * El cliente, tipado contra el esquema real.
 *
 * Antes era `any`, así que ninguna consulta de este archivo estaba validada:
 * una columna mal escrita compilaba y fallaba recién en producción. Ver
 * lib/types/database.ts.
 */
type SB = SupabaseClient<Database>

interface CeldaRow {
  integrante_id: string
  dia_semana: number
  hora: number
  publica?: boolean
}

interface EventoOcupaRow {
  inicio: string
  fin: string
  eventos_asistentes: { integrante_id: string }[] | null
}

interface IntegranteRow {
  id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  auth_user_id: string | null
  recibe_citas: boolean | null
  visible_en_landing: boolean | null
}

export class DisponibilidadRepository {
  private sb: SB

  constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.sb = supabase as SB
  }

  /** Disponibilidad de todos los integrantes activos, marcando la propia del usuario actual */
  async listAll(authUserId: string): Promise<DisponibilidadIntegrante[]> {
    const [{ data: integrantes, error: e1 }, { data: celdas, error: e2 }] = await Promise.all([
      this.sb
        .from('dim_integrantes')
        .select('id, nombre, avatar_url, color, auth_user_id, recibe_citas, visible_en_landing')
        .eq('activo', true)
        .order('nombre'),
      this.sb
        .from('disponibilidad')
        .select('integrante_id, dia_semana, hora, publica'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    const porIntegrante = new Map<string, Celda[]>()
    for (const c of (celdas ?? []) as CeldaRow[]) {
      const arr = porIntegrante.get(c.integrante_id) ?? []
      arr.push({ dia_semana: c.dia_semana, hora: c.hora, publica: c.publica ?? false })
      porIntegrante.set(c.integrante_id, arr)
    }

    return ((integrantes ?? []) as IntegranteRow[]).map((i) => ({
      integrante_id: i.id,
      nombre: i.nombre,
      avatar_url: i.avatar_url,
      color: i.color,
      es_propio: i.auth_user_id === authUserId,
      celdas: porIntegrante.get(i.id) ?? [],
      recibe_citas: i.recibe_citas ?? false,
      visible_en_landing: i.visible_en_landing ?? false,
    }))
  }

  /**
   * Enciende o apaga el interruptor maestro de citas del propio integrante.
   *
   * No hace falta comprobar acá que sea el suyo: la RLS solo autoriza UPDATE
   * sobre la fila con `auth_user_id = auth.uid()` (066), y el GRANT columnar de
   * la 090 limita la escritura a esta única columna. Dos candados, y ninguno
   * depende de que este método recuerde chequearlo.
   */
  async setRecibeCitas(integranteId: string, recibeCitas: boolean): Promise<void> {
    const { error } = await this.sb
      .from('dim_integrantes')
      .update({ recibe_citas: recibeCitas })
      .eq('id', integranteId)
    if (error) throw new Error(error.message)
  }

  /**
   * Reemplaza por completo la disponibilidad del integrante (guardado
   * idempotente desde la grilla). Vía RPC (migración 073): delete+insert en
   * una sola transacción, para no perder toda la disponibilidad guardada si
   * el insert fallaba después del delete.
   */
  async replaceOwn(integranteId: string, celdas: Celda[]): Promise<void> {
    // La firma de 4 parámetros (migración 090). La de 3 sigue existiendo y
    // conserva lo publicado, pero acá sí sabemos qué celdas van públicas, así
    // que se manda explícito en vez de depender de que la base lo adivine.
    const { error } = await this.sb.rpc('reemplazar_disponibilidad', {
      p_integrante_id: integranteId,
      p_dias: celdas.map((c) => c.dia_semana),
      p_horas: celdas.map((c) => c.hora),
      p_publicas: celdas.map((c) => c.publica ?? false),
    })
    if (error) throw new Error(error.message)
  }

  /**
   * Huecos reservables desde la landing, **anónimos**: solo fecha y hora.
   *
   * Un slot aparece si al menos una persona elegible lo tiene libre. Nunca se
   * dice quién ni cuántos — ver `SlotPublico` para por qué eso importa.
   *
   * Elegible = las tres condiciones, y ninguna sobra:
   *   · `activo`             — sigue en el equipo
   *   · `visible_en_landing` — la empresa decidió publicarlo (044)
   *   · `recibe_citas`       — la persona decidió atender desconocidos (090)
   *
   * Ocupación: un evento con asistentes internos bloquea solo a esos; uno sin
   * asistentes bloquea a todos. Los que entran por el sync de Google llegan sin
   * asistentes mapeados, y el calendario es compartido: si hay algo ahí, no se
   * agenda encima.
   *
   * Corre con service role (el llamador no tiene sesión), así que la RLS no
   * filtra nada acá: el acotado lo hacen los WHERE de este método. Por eso la
   * salida se arma a mano y no se devuelve ninguna fila cruda.
   */
  async slotsPublicos(desde: string, dias: number): Promise<SlotPublico[]> {
    const hasta = sumarDias(desde, dias)

    const [{ data: elegibles, error: e1 }, { data: celdas, error: e2 }] = await Promise.all([
      this.sb
        .from('dim_integrantes')
        .select('id')
        .eq('activo', true)
        .eq('visible_en_landing', true)
        .eq('recibe_citas', true),
      this.sb
        .from('disponibilidad')
        .select('integrante_id, dia_semana, hora')
        .eq('publica', true),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    const idsElegibles = new Set(((elegibles ?? []) as { id: string }[]).map((i) => i.id))
    if (idsElegibles.size === 0) return []

    const celdasOfrecidas: CeldaOfrecida[] = ((celdas ?? []) as CeldaRow[])
      .filter((c) => idsElegibles.has(c.integrante_id))
      .map((c) => ({
        integranteId: c.integrante_id,
        diaSemana: c.dia_semana,
        hora: c.hora,
      }))
    if (celdasOfrecidas.length === 0) return []

    // Eventos que solapan la ventana, con sus asistentes internos.
    const { data: eventos, error: e3 } = await this.sb
      .from('eventos')
      .select('inicio, fin, eventos_asistentes(integrante_id)')
      .lt('inicio', `${hasta}T23:59:59Z`)
      .gt('fin', `${desde}T00:00:00Z`)
    if (e3) throw new Error(e3.message)

    const ocupaciones: Ocupacion[] = ((eventos ?? []) as EventoOcupaRow[]).map((ev) => ({
      inicio: new Date(ev.inicio).getTime(),
      fin: new Date(ev.fin).getTime(),
      // Vacío = bloquea a todos. Así llegan los eventos del sync de Google,
      // que caen sobre el calendario compartido del negocio.
      integrantes: (ev.eventos_asistentes ?? []).map((a) => a.integrante_id),
    }))

    return calcularSlots({
      desde,
      dias,
      celdas: celdasOfrecidas,
      ocupaciones,
      ahora: new Date(),
    })
  }

  /** id del integrante asociado al usuario auth actual (null si no es integrante activo) */
  async integranteIdDe(authUserId: string): Promise<string | null> {
    const { data } = await this.sb
      .from('dim_integrantes')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('activo', true)
      .single()
    return data?.id ?? null
  }
}
