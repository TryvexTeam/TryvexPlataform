import { z } from 'zod'

export const RecuperarPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido').max(254),
})

export type RecuperarPasswordInput = z.infer<typeof RecuperarPasswordSchema>

/**
 * Reglas de contraseña. Longitud por encima de todo: es lo único que crece el espacio
 * de búsqueda de verdad. Las clases de caracteres solo evitan las tres o cuatro
 * contraseñas obvias que la gente escribe cuando el mínimo es corto.
 */
export const PASSWORD_MIN = 10

export const NuevaPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN, `Mínimo ${PASSWORD_MIN} caracteres`)
      .max(72, 'Máximo 72 caracteres')
      .regex(/[a-zA-Z]/, 'Debe incluir al menos una letra')
      .regex(/[0-9]/, 'Debe incluir al menos un número'),
    confirmacion: z.string(),
  })
  .refine((d) => d.password === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  })

export type NuevaPasswordInput = z.infer<typeof NuevaPasswordSchema>

const DEBILES = [
  'password', 'contrasena', 'contraseña', 'qwerty', '123456', 'admin',
  'tryvex', 'bienvenido', 'welcome', 'iloveyou',
]

/** Chequeo barato contra lo evidente. No sustituye al schema; lo complementa. */
export function passwordDemasiadoObvia(password: string): boolean {
  const p = password.toLowerCase()
  if (DEBILES.some((d) => p.includes(d))) return true
  if (/^(.)\1+$/.test(p)) return true // un solo carácter repetido
  if (/^(0123456789|1234567890|abcdefghij)/.test(p)) return true
  return false
}
