import { z } from 'zod'

/**
 * Revocacion de acceso. Es la accion mas destructiva que tiene la app sobre una
 * persona, asi que el contrato es deliberadamente estrecho: un integrante, un
 * booleano y, opcionalmente, el porque.
 */
export const CambiarAccesoSchema = z.object({
  integrante_id: z.string().uuid(),
  activo: z.boolean(),
  /**
   * El motivo se recorta a 500: entra en la bitacora, no es un expediente. El
   * `trim()` evita que un espacio en blanco cuente como justificacion escrita.
   */
  motivo: z.string().trim().max(500).optional(),
})

export type CambiarAccesoInput = z.infer<typeof CambiarAccesoSchema>

/** Una persona en la pantalla de acceso. Incluye inactivos: son los que se restauran. */
export type IntegranteAcceso = {
  id: string
  nombre: string
  email: string
  activo: boolean
  es_superadmin: boolean
  auth_user_id: string | null
  desvinculado_at: string | null
}

export type IpCandidata = {
  ip: string
  ultima_vez: string
  origen: 'app' | 'sesion'
  compartida_con: string[]
  /** Es la IP desde la que el administrador hace la petición. */
  es_tuya?: boolean
}

export type IpBloqueada = {
  ip: string
  integrante_id: string | null
  integrante_nombre: string | null
  motivo: string | null
  created_at: string
}

export const DesvincularSchema = z.object({
  integrante_id: z.string().uuid(),
  ips: z.array(z.string().trim().min(1)).max(50),
  motivo: z.string().trim().max(500).optional(),
  confirmacion: z.string(),
})

export const ReingresoSchema = z.object({ integrante_id: z.string().uuid() })

export const IpQuerySchema = z.object({ ip: z.string().trim().min(1) })

/**
 * Lo que devuelve una revocacion. `sesiones_cerradas` viaja hasta la UI a
 * proposito: es la diferencia entre "marque una casilla" y "esta persona esta
 * afuera". Sin ese numero, el administrador no tiene forma de saber cual de las
 * dos cosas ocurrio.
 */
export type ResultadoAcceso = {
  integrante_id: string
  nombre: string
  activo: boolean
  sesiones_cerradas: number
}

export const CAMPOS_ACCESO = 'id, nombre, email, activo, es_superadmin, auth_user_id, desvinculado_at'
