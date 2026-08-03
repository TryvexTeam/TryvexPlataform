import { z } from 'zod'

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
})

export const PerfilUpdateSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').optional(),
  especialidad: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  color: z.enum(COLORES_HEX).nullable().optional(),
  horario: z.array(HorarioDiaSchema).nullable().optional(),
  notificaciones: NotificacionesSchema.partial().nullable().optional(),
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
  activo: boolean
  es_admin: boolean
  color: string | null
  telefono: string | null
  horario: HorarioDia[] | null
  notificaciones: Partial<Notificaciones> | null
  created_at: string
}

export const NOTIFICACIONES_LABELS: { key: keyof Notificaciones; label: string; descripcion: string }[] = [
  { key: 'nuevo_cliente', label: 'Nuevo cliente', descripcion: 'Cuando se crea un cliente' },
  { key: 'proyecto_asignado', label: 'Proyecto asignado', descripcion: 'Cuando te asignan un proyecto o se crea uno nuevo' },
  { key: 'entrega_proxima', label: 'Entrega próxima', descripcion: 'Cuando falta 1 semana o menos para una entrega' },
  { key: 'cobro_proximo', label: 'Cobro próximo', descripcion: 'Cuando se acerca una fecha de cobro pendiente' },
  { key: 'tarea_asignada', label: 'Tarea asignada', descripcion: 'Cuando te asignan una tarea con fecha' },
  { key: 'cita_invitado', label: 'Citas', descripcion: 'Cuando te invitan a una cita o evento' },
]

export const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
