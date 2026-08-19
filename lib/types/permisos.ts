import { z } from 'zod'

/**
 * Accesos que el dueño reparte. Son permisos sueltos a propósito: dar visibilidad de
 * las finanzas no debe convertir a nadie en administrador de todo lo demás.
 */
export const PERMISOS = ['ver_jornadas_equipo', 'ver_finanzas', 'gestionar_finanzas'] as const

export type Privilegio = (typeof PERMISOS)[number]

/**
 * Aparecer en tryvex.tech no es un privilegio: no da acceso a nada. Pero se reparte
 * desde la misma pantalla y por la misma vía (el trigger de la 028, extendido en la
 * 044), porque publicar a alguien en la web de la empresa es una decisión del dueño
 * y no algo que cada integrante active para sí mismo.
 *
 * Se mantiene separado de PERMISOS porque `puede()` da todo por cierto cuando la
 * persona es dueña — y ser dueño no significa querer salir en la landing.
 */
export const VISIBILIDADES = ['visible_en_landing'] as const

export type Visibilidad = (typeof VISIBILIDADES)[number]

/** Todo lo que /api/permisos sabe cambiar de un integrante. */
export type Permiso = Privilegio | Visibilidad

export const PERMISO_LABELS: { key: Privilegio; label: string; descripcion: string }[] = [
  {
    key: 'ver_jornadas_equipo',
    label: 'Ver jornada del equipo',
    descripcion: 'Entradas, salidas y horas de todos los integrantes, no solo las propias',
  },
  {
    key: 'ver_finanzas',
    label: 'Ver finanzas',
    descripcion: 'Ingresos, egresos, saldo y comprobantes de la empresa (solo lectura)',
  },
  {
    key: 'gestionar_finanzas',
    label: 'Gestionar finanzas',
    descripcion: 'Registrar, editar y borrar movimientos, y adjuntar vouchers. Incluye ver.',
  },
]

export const VISIBILIDAD_LABELS: { key: Visibilidad; label: string; descripcion: string }[] = [
  {
    key: 'visible_en_landing',
    label: 'Aparece en tryvex.tech',
    descripcion: 'Publica su ficha en la página de equipo. Además necesita bio corta y foto de perfil.',
  },
]

export const ActualizarPermisosSchema = z.object({
  integrante_id: z.string().uuid(),
  ver_jornadas_equipo: z.boolean().optional(),
  ver_finanzas: z.boolean().optional(),
  gestionar_finanzas: z.boolean().optional(),
  visible_en_landing: z.boolean().optional(),
})

export type ActualizarPermisosInput = z.infer<typeof ActualizarPermisosSchema>

export type IntegrantePermisos = {
  id: string
  nombre: string
  email: string
  /** Foto de perfil. Viaja con los permisos porque es la misma fila. */
  avatar_url: string | null
  activo: boolean
  es_superadmin: boolean
  ver_jornadas_equipo: boolean
  ver_finanzas: boolean
  gestionar_finanzas: boolean
  visible_en_landing: boolean
}

/**
 * Gestionar implica ver. Se normaliza aquí y no solo en la UI porque la base guarda
 * las dos columnas por separado: si quedara `gestionar=true, ver=false`, la fila se
 * vería contradictoria en cualquier consulta directa aunque `tengo_permiso()` la
 * resuelva bien.
 *
 * `visible_en_landing` no entra en ninguna implicación: es independiente del resto y
 * pasa por acá sin tocarse.
 */
export function normalizarPermisos<T extends { ver_finanzas?: boolean; gestionar_finanzas?: boolean }>(
  cambios: T,
): T {
  if (cambios.gestionar_finanzas === true) return { ...cambios, ver_finanzas: true }
  return cambios
}
