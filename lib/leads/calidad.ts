import type { Lead } from '@/lib/types/lead'

/**
 * Qué tan "llamable" está un lead, para no perder tiempo con datos malos.
 *
 * La auditoría del scraper (28-ago) encontró que ~18% de los leads tienen el
 * teléfono roto —76 con 7 dígitos, imposibles de marcar— y muchos sin comuna o
 * sin rating. Esto le pone a cada lead un semáforo para que, antes de llamar, se
 * vea de un vistazo cuáles valen la pena.
 *
 *  · rojo    = el teléfono NO sirve para llamar (o no hay). Es el bloqueante.
 *  · amarillo= se puede llamar, pero falta contexto (comuna o rating).
 *  · verde   = teléfono válido + comuna + rating: listo para llamar.
 */
export type NivelCalidad = 'verde' | 'amarillo' | 'rojo'

/**
 * ¿El teléfono se puede marcar en Chile? Móvil (+56 9 XXXXXXXX = 9 dígitos que
 * empiezan en 9) o fijo (8-9 dígitos). Un número de 7 dígitos —el error típico
 * del scraper, un fijo al que le falta el código de área— NO es llamable.
 */
export function telefonoLlamable(telefono: string | null | undefined): boolean {
  if (!telefono) return false
  const dig = telefono.replace(/\D/g, '')
  const sig = dig.startsWith('56') ? dig.slice(2) : dig
  if (sig.length === 9 && sig.startsWith('9')) return true // móvil
  if (sig.length === 9) return true // fijo con código de área (2XXXXXXXX)
  // 8 dígitos NO es llamable: es un fijo al que le falta el código de área.
  // Marcarlo verde mandaba a alguien a llamar un número que no existe — y del
  // otro lado, `lib/vex/telefono` le inventaba un "9" y lo volvía un móvil
  // ajeno. Los dos lados del mismo número incompleto, mintiendo distinto.
  return false
}

/** ¿La localidad deja ver una comuna? (no vacía y con algo más que la dirección) */
export function tieneComuna(localidad: string | null | undefined): boolean {
  if (!localidad) return false
  return /Región|Metropolitana|Valparaíso|Bío|Chile|,/i.test(localidad)
}

export interface Calidad {
  nivel: NivelCalidad
  llamable: boolean
  motivos: string[]
}

export function calidadLead(lead: Lead): Calidad {
  const llamable = telefonoLlamable(lead.telefono)
  const motivos: string[] = []

  if (!lead.telefono) motivos.push('sin teléfono')
  else if (!llamable) motivos.push('teléfono inválido (no se puede marcar)')
  if (!tieneComuna(lead.localidad)) motivos.push('sin comuna clara')
  if (lead.google_rating == null) motivos.push('sin rating')

  let nivel: NivelCalidad
  if (!llamable) nivel = 'rojo'
  else if (!tieneComuna(lead.localidad) || lead.google_rating == null) nivel = 'amarillo'
  else nivel = 'verde'

  return { nivel, llamable, motivos }
}

export const COLOR_CALIDAD: Record<NivelCalidad, string> = {
  verde: 'oklch(72% 0.17 145)',
  amarillo: 'oklch(74% 0.17 75)',
  rojo: 'oklch(63% 0.21 22)',
}

export const ETIQUETA_CALIDAD: Record<NivelCalidad, string> = {
  verde: 'Listo para llamar',
  amarillo: 'Llamable, falta contexto',
  rojo: 'No se puede llamar',
}
