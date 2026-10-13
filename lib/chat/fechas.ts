const ZONA = 'America/Santiago'

const claveDia = (fecha: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha)

function desplazarDia(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 86_400_000)
}

export function etiquetaFecha(valor: string | Date, ahora = new Date()): string {
  const fecha = typeof valor === 'string' ? new Date(valor) : valor
  const clave = claveDia(fecha)
  if (clave === claveDia(ahora)) return 'Hoy'
  if (clave === claveDia(desplazarDia(ahora, -1))) return 'Ayer'

  const dias = Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000)
  if (dias < 7) {
    return new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, weekday: 'long' }).format(fecha)
  }
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA,
    day: 'numeric',
    month: 'short',
    year: fecha.getFullYear() === ahora.getFullYear() ? undefined : 'numeric',
  }).format(fecha)
}
