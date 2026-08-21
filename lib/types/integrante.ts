import { z } from 'zod'
import { esTelefonoValido, normalizarTelefonoCL } from '@/lib/telefono'

/** Paleta curada estilo Google Calendar — el selector solo permite estos valores */
export const PALETA_CALENDARIO = [
  { hex: '#D50000', nombre: 'Tomate' },
  { hex: '#E67C73', nombre: 'Flamenco' },
  { hex: '#F4511E', nombre: 'Mandarina' },
  { hex: '#F6BF26', nombre: 'Plátano' },
  { hex: '#33B679', nombre: 'Salvia' },
  { hex: '#0B8043', nombre: 'Albahaca' },
  { hex: '#039BE5', nombre: 'Arándano' },
  { hex: '#3F51B5', nombre: 'Lavanda' },
  { hex: '#7986CB', nombre: 'Glicina' },
  { hex: '#8E24AA', nombre: 'Uva' },
  { hex: '#616161', nombre: 'Grafito' },
  { hex: '#EF6C00', nombre: 'Calabaza' },
  { hex: '#C0CA33', nombre: 'Pistacho' },
  { hex: '#00ACC1', nombre: 'Pavo real' },
  { hex: '#009688', nombre: 'Eucalipto' },
  { hex: '#795548', nombre: 'Cacao' },
  { hex: '#AD1457', nombre: 'Frambuesa' },
  { hex: '#5C6BC0', nombre: 'Cobalto' },
  { hex: '#00897B', nombre: 'Jade' },
  { hex: '#FF7043', nombre: 'Coral' },
] as const

const COLORES_HEX = PALETA_CALENDARIO.map((c) => c.hex) as unknown as [string, ...string[]]

export const BloqueHorarioSchema = z.object({
  inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  fin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
})

export const HorarioDiaSchema = z.object({
  dia: z.number().int().min(0).max(6),
  activo: z.boolean(),
  bloques: z.array(BloqueHorarioSchema).max(3),
})

export const NotificacionesSchema = z.object({
  nuevo_cliente: z.boolean().default(true),
  proyecto_asignado: z.boolean().default(true),
  entrega_proxima: z.boolean().default(true),
  cobro_proximo: z.boolean().default(true),
  tarea_asignada: z.boolean().default(true),
  cita_invitado: z.boolean().default(true),
  llamada_entrante: z.boolean().default(true),
})

/**
 * Teléfono del integrante: entra como lo escriba la persona y sale en E.164.
 *
 * El porqué de normalizar acá y no en el componente: la ficha arma el botón de
 * llamar con `tel:` directo sobre este valor, y el CHECK de la migración 034 rechaza
 * cualquier otro formato. Si el schema dejara pasar "920394617", el guardado
 * explotaría con un error de Postgres ilegible en vez de un mensaje al usuario.
 *
 * El string vacío se trata como "borrar el teléfono", no como error: es lo que
 * produce un input al que le limpiaron el contenido.
 */
const TelefonoSchema = z
  .string()
  .nullable()
  .refine((valor) => valor === null || valor.trim() === '' || esTelefonoValido(valor), {
    message: 'Teléfono chileno inválido. Ej: +56 9 1234 5678',
  })
  .transform((valor): string | null =>
    valor === null || valor.trim() === '' ? null : normalizarTelefonoCL(valor)
  )

/** Vacío se trata como "borrar el link", igual que el teléfono de arriba. */
const UrlOpcionalSchema = z
  .string()
  .nullable()
  .optional()
  .refine(
    (v) => {
      if (!v || v.trim() === '') return true
      const parsed = z.string().url().safeParse(v)
      if (!parsed.success) return false
      try {
        return ['http:', 'https:'].includes(new URL(v).protocol)
      } catch {
        return false
      }
    },
    // z.string().url() solo valida forma, no protocolo — sin esto "javascript:..."
    // pasaba y termina en un <a href> de la landing pública (anon-legible).
    { message: 'URL inválida (debe empezar con http:// o https://)' }
  )
  .transform((v) => (v && v.trim() !== '' ? v : null))

export const CATEGORIAS_EQUIPO = ['core', 'engineering'] as const

export const PerfilUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  especialidad: z.string().nullable().optional(),
  telefono: TelefonoSchema.optional(),
  color: z.enum(COLORES_HEX).nullable().optional(),
  horario: z.array(HorarioDiaSchema).nullable().optional(),
  notificaciones: NotificacionesSchema.partial().nullable().optional(),
  // Estos cinco solo alimentan la ficha pública en tryvex.tech (ver v_equipo_publico).
  bio_corta: z.string().max(160, 'Máximo 160 caracteres').nullable().optional(),
  bio: z.string().max(2000, 'Máximo 2000 caracteres').nullable().optional(),
  linkedin: UrlOpcionalSchema,
  portfolio: UrlOpcionalSchema,
  category: z.enum(CATEGORIAS_EQUIPO).optional(),
})

export type BloqueHorario = z.infer<typeof BloqueHorarioSchema>
export type HorarioDia = z.infer<typeof HorarioDiaSchema>
export type Notificaciones = z.infer<typeof NotificacionesSchema>
export type PerfilUpdate = z.infer<typeof PerfilUpdateSchema>

export type Integrante = {
  id: string
  auth_user_id: string | null
  nombre: string
  email: string
  rol_principal: string | null
  especialidad: string | null
  avatar_url: string | null
  /**
   * Foto en alta resolución para tryvex.tech/team. Se escribe solo desde
   * /api/perfil/foto-landing, igual que avatar_url, y por eso NO está en
   * PerfilUpdateSchema: no viaja en el PATCH del formulario.
   * Cuando es null, la landing publica avatar_url (ver v_equipo_publico).
   */
  foto_landing_url: string | null
  activo: boolean
  /** @deprecated desde la migración 028 — usar es_superadmin. Se mantiene solo por compat de lectura. */
  es_admin: boolean
  es_superadmin: boolean
  color: string | null
  telefono: string | null
  horario: HorarioDia[] | null
  notificaciones: Partial<Notificaciones> | null
  created_at: string
  bio_corta: string | null
  bio: string | null
  linkedin: string | null
  portfolio: string | null
  category: (typeof CATEGORIAS_EQUIPO)[number]
  /**
   * Si su ficha sale publicada en tryvex.tech (ver v_equipo_publico, migración 044).
   * No está en PerfilUpdateSchema a propósito: lo enciende el dueño desde
   * /admin/permisos, no la persona desde /settings.
   */
  visible_en_landing: boolean
}

export const NOTIFICACIONES_LABELS: { key: keyof Notificaciones; label: string; descripcion: string }[] = [
  { key: 'nuevo_cliente', label: 'Nuevo cliente', descripcion: 'Cuando se crea un cliente' },
  { key: 'proyecto_asignado', label: 'Proyecto asignado', descripcion: 'Cuando te asignan un proyecto o se crea uno nuevo' },
  { key: 'entrega_proxima', label: 'Entrega próxima', descripcion: 'Cuando falta 1 semana o menos para una entrega' },
  { key: 'cobro_proximo', label: 'Cobro próximo', descripcion: 'Cuando se acerca una fecha de cobro pendiente' },
  { key: 'tarea_asignada', label: 'Tarea asignada', descripcion: 'Cuando te asignan una tarea con fecha' },
  { key: 'cita_invitado', label: 'Citas', descripcion: 'Cuando te invitan a una cita o evento' },
  { key: 'llamada_entrante', label: 'Llamadas', descripcion: 'Cuando alguien del equipo te llama por la app' },
]

export const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
