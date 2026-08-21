/**
 * Rate limiting mínimo para las rutas de `/api/agentes/*`.
 *
 * Hallazgo de auditoría (agosto 2026, documentado en `lib/agentes/token.ts`):
 * ninguna ruta de agente tenía límite de tasa. La solución completa (Redis/
 * Upstash o una tabla Postgres con limpieza propia) queda fuera de alcance a
 * propósito — merece su propio PR revisado, no algo improvisado acá.
 *
 * Esto es el mínimo seguro mientras tanto: ventana fija en memoria del propio
 * proceso Node (el server corre como servicio persistente — PM2/systemd — no
 * serverless, así que el estado sobrevive entre requests de verdad). No
 * protege contra un ataque distribuido ni sobrevive un restart/deploy, pero
 * cierra el caso real de hoy: un agente con un bug en su loop reintentando
 * sin parar, o un token filtrado usado a lo bruto.
 */

const VENTANA_MS = 60_000
const LIMITE_POR_VENTANA = 60

interface Contador {
  cuenta: number
  reiniciaEn: number
}

const contadores = new Map<string, Contador>()

// Sin esto el Map crece para siempre con un agente por fila y nunca se libera
// memoria de los que dejaron de pegarle a la API.
function limpiarVencidos(ahora: number) {
  for (const [clave, c] of contadores) {
    if (c.reiniciaEn <= ahora) contadores.delete(clave)
  }
}

/**
 * @returns null si puede pasar, o el número de segundos que debe esperar
 * (para el header `Retry-After`) si superó el límite.
 */
export function excedeLimite(agenteId: string): number | null {
  const ahora = Date.now()
  if (contadores.size > 500) limpiarVencidos(ahora)

  const actual = contadores.get(agenteId)
  if (!actual || actual.reiniciaEn <= ahora) {
    contadores.set(agenteId, { cuenta: 1, reiniciaEn: ahora + VENTANA_MS })
    return null
  }

  actual.cuenta++
  if (actual.cuenta > LIMITE_POR_VENTANA) {
    return Math.ceil((actual.reiniciaEn - ahora) / 1000)
  }
  return null
}
