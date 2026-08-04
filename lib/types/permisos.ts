import { z } from 'zod'

/**
 * Accesos que el dueño reparte. Son permisos sueltos a propósito: dar visibilidad de
 * las finanzas no debe convertir a nadie en administrador de todo lo demás.
 */
export const PERMISOS = ['ver_jornadas_equipo', 'ver_finanzas', 'gestionar_finanzas'] as const

export type Permiso = (typeof PERMISOS)[number]

export const PERMISO_LABELS: { key: Permiso; label: string; descripcion: string }[] = [
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

export const ActualizarPermisosSchema = z.object({
  integrante_id: z.string().uuid(),
  ver_jornadas_equipo: z.boolean().optional(),
  ver_finanzas: z.boolean().optional(),
  gestionar_finanzas: z.boolean().optional(),
})

export type ActualizarPermisosInput = z.infer<typeof ActualizarPermisosSchema>

export type IntegrantePermisos = {
  id: string
  nombre: string
  email: string
  activo: boolean
  es_superadmin: boolean
  ver_jornadas_equipo: boolean
  ver_finanzas: boolean
  gestionar_finanzas: boolean
}

/**
 * Gestionar implica ver. Se normaliza aquí y no solo en la UI porque la base guarda
 * las dos columnas por separado: si quedara `gestionar=true, ver=false`, la fila se
 * vería contradictoria en cualquier consulta directa aunque `tengo_permiso()` la
 * resuelva bien.
 */
export function normalizarPermisos<T extends { ver_finanzas?: boolean; gestionar_finanzas?: boolean }>(
  cambios: T,
): T {
  if (cambios.gestionar_finanzas === true) return { ...cambios, ver_finanzas: true }
  return cambios
}
