import { createClient } from '@/lib/supabase/server'
import type { Celda, DisponibilidadIntegrante, SlotPublico } from '@/lib/types/disponibilidad'
import {
  ANTICIPACION_MINIMA_HORAS,
  DURACION_CITA_MIN,
  MINUTOS_DE_SLOT,
} from '@/lib/types/disponibilidad'
import { diaSemanaLunes0, santiagoToUTC, sumarDias } from '@/lib/fechas'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any

interface CeldaRow {
  integrante_id: string
  dia_semana: number
  hora: number
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
        .select('id, nombre, avatar_url, color, auth_user_id')
        .eq('activo', true)
        .order('nombre'),
      this.sb
        .from('disponibilidad')
        .select('integrante_id, dia_semana, hora'),
    ])
    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)

    const porIntegrante = new Map<string, Celda[]>()
    for (const c of (celdas ?? []) as CeldaRow[]) {
      const arr = porIntegrante.get(c.integrante_id) ?? []
      arr.push({ dia_semana: c.dia_semana, hora: c.hora })
      porIntegrante.set(c.integrante_id, arr)
    }

    return ((integrantes ?? []) as IntegranteRow[]).map((i) => ({
      integrante_id: i.id,
      nombre: i.nombre,
      avatar_url: i.avatar_url,
      color: i.color,
      es_propio: i.auth_user_id === authUserId,
      celdas: porIntegrante.get(i.id) ?? [],
    }))
  }

  /**
   * Reemplaza por completo la disponibilidad del integrante (guardado
   * idempotente desde la grilla). Vía RPC (migración 073): delete+insert en
   * una sola transacción, para no perder toda la disponibilidad guardada si
   * el insert fallaba después del delete.
   */
  async replaceOwn(integranteId: string, celdas: Celda[]): Promise<void> {
    const { error } = await this.sb.rpc('reemplazar_disponibilidad', {
      p_integrante_id: integranteId,
      p_dias: celdas.map((c) => c.dia_semana),
      p_horas: celdas.map((c) => c.hora),
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

    // Celdas publicadas, solo de gente elegible, indexadas por día y hora.
    const porDiaHora = new Map<string, Set<string>>()
    for (const c of (celdas ?? []) as CeldaRow[]) {
      if (!idsElegibles.has(c.integrante_id)) continue
      const clave = `${c.dia_semana}-${c.hora}`
      const set = porDiaHora.get(clave) ?? new Set<string>()
      set.add(c.integrante_id)
      porDiaHora.set(clave, set)
    }
    if (porDiaHora.size === 0) return []

    // Eventos que solapan la ventana, con sus asistentes internos.
    const { data: eventos, error: e3 } = await this.sb
      .from('eventos')
      .select('inicio, fin, eventos_asistentes(integrante_id)')
      .lt('inicio', `${hasta}T23:59:59Z`)
      .gt('fin', `${desde}T00:00:00Z`)
    if (e3) throw new Error(e3.message)

    const ocupaciones = ((eventos ?? []) as EventoOcupaRow[]).map((ev) => ({
      inicio: new Date(ev.inicio).getTime(),
      fin: new Date(ev.fin).getTime(),
      // Sin asistentes = calendario compartido del negocio = bloquea a todos.
      asistentes: (ev.eventos_asistentes ?? []).map((a) => a.integrante_id),
    }))

    const ahora = Date.now()
    const minimo = ahora + ANTICIPACION_MINIMA_HORAS * 60 * 60 * 1000
    const slots: SlotPublico[] = []

    for (let d = 0; d < dias; d++) {
      const fecha = sumarDias(desde, d)
      const diaSemana = diaSemanaLunes0(fecha)

      for (let hora = 0; hora < 24; hora++) {
        const disponiblesEnCelda = porDiaHora.get(`${diaSemana}-${hora}`)
        if (!disponiblesEnCelda) continue

        for (const minuto of MINUTOS_DE_SLOT) {
          const hhmm = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
          const inicio = santiagoToUTC(fecha, hhmm).getTime()
          const fin = inicio + DURACION_CITA_MIN * 60 * 1000

          // Ya pasó, o es demasiado sobre la hora para que alguien se prepare.
          if (inicio < minimo) continue

          const hayAlguienLibre = [...disponiblesEnCelda].some((integranteId) =>
            !ocupaciones.some(
              (o) =>
                inicio < o.fin &&
                fin > o.inicio &&
                (o.asistentes.length === 0 || o.asistentes.includes(integranteId))
            )
          )

          if (hayAlguienLibre) slots.push({ fecha, hora: hhmm })
        }
      }
    }

    return slots
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
