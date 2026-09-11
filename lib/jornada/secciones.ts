/**
 * En qué partes del CRM hay que haber marcado entrada.
 *
 * Sale de lo que dijo Cristian el 11-sep-2026: *"no hay algo que nos obliga a
 * hacer las tareas o a activar la jornada, entonces no avanzamos ni
 * escalamos"*.
 *
 * **Solo se frena donde uno viene a producir.** El panel, el perfil, la
 * configuración y la propia página de jornada quedan libres. Fue decisión suya
 * frente a bloquear el CRM entero, y evita el peor efecto secundario: que
 * alguien que entra cinco minutos un domingo a mirar un lead marque una jornada
 * falsa, y que las horas dejen de significar algo.
 */
export const SECCIONES_DE_TRABAJO = ['/leads', '/tareas', '/clientes', '/proyectos', '/chat']

export function esSeccionDeTrabajo(pathname: string): boolean {
  // La barra del final importa: '/tareas-viejas' no es '/tareas'.
  return SECCIONES_DE_TRABAJO.some((s) => pathname === s || pathname.startsWith(`${s}/`))
}
