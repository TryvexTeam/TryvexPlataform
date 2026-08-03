import { z } from 'zod'

export const EnviarMensajeSchema = z.object({
  conversacion_id: z.string().uuid(),
  contenido: z.string().trim().min(1, 'El mensaje está vacío').max(4000, 'Máximo 4000 caracteres'),
})

export const CrearConversacionSchema = z
  .object({
    tipo: z.enum(['dm', 'grupo']),
    nombre: z.string().trim().min(1).max(80).optional(),
    /** DM: el otro integrante. Grupo: todos los que se suman además de quien lo crea. */
    miembros: z.array(z.string().uuid()).min(1, 'Elige al menos una persona'),
  })
  .refine((v) => v.tipo === 'dm' || Boolean(v.nombre), {
    message: 'Los grupos necesitan nombre',
    path: ['nombre'],
  })
  .refine((v) => v.tipo === 'grupo' || v.miembros.length === 1, {
    message: 'Un mensaje directo es entre dos personas',
    path: ['miembros'],
  })

export type EnviarMensajeInput = z.infer<typeof EnviarMensajeSchema>
export type CrearConversacionInput = z.infer<typeof CrearConversacionSchema>

export type TipoConversacion = 'dm' | 'grupo'

export type MiembroChat = {
  integrante_id: string
  nombre: string
  avatar_url: string | null
  color: string | null
  ultimo_leido_at: string
}

export type Mensaje = {
  id: string
  conversacion_id: string
  autor_id: string
  contenido: string
  created_at: string
  editado_at: string | null
  eliminado_at: string | null
}

export type Conversacion = {
  id: string
  tipo: TipoConversacion
  nombre: string | null
  ultimo_mensaje_at: string
  miembros: MiembroChat[]
  ultimo_mensaje: Mensaje | null
  no_leidos: number
}

/** Clave canónica de un DM: el par de UUIDs ordenado, para que exista un solo hilo. */
export function claveDm(a: string, b: string): string {
  return [a, b].sort().join(':')
}

/** En un DM el título es la otra persona; en un grupo, su nombre. */
export function tituloConversacion(conv: Conversacion, miIntegranteId: string): string {
  if (conv.tipo === 'grupo') return conv.nombre ?? 'Grupo'
  const otro = conv.miembros.find((m) => m.integrante_id !== miIntegranteId)
  return otro?.nombre ?? 'Mensaje directo'
}
