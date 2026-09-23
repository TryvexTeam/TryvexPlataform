// Reglas puras del puente de agente: qué hacer con cada encargo, qué texto
// recibe el modelo, qué se responde en el CRM y cuánto esperar. Sin red ni
// disco, para poder probarlas sin levantar nada (ver reglas.test.ts).

/** La API del CRM rechaza respuestas de más de 8000 caracteres. */
export const MAX_RESPUESTA = 7900

/** Intentos por encargo antes de rendirse y avisarlo en el CRM. */
export const MAX_INTENTOS = 2

/**
 * Qué hacer con un encargo que devolvió el CRM.
 *
 * `local` es lo que ESTA máquina recuerda de ese encargo (o undefined). Es lo
 * que distingue "lo tomé yo y me caí a mitad" de "lo tomó otra máquina con el
 * mismo agente": el primero se retoma, el segundo no se toca.
 *
 * @param {{ id: string, estado: string }} encargo
 * @param {{ intentos: number } | undefined} local
 * @returns {'tomar' | 'reintentar' | 'rendirse' | 'ajeno'}
 */
export function decidir(encargo, local, maxIntentos = MAX_INTENTOS) {
  if (encargo.estado === 'aprobado') return 'tomar'
  if (!local) return 'ajeno'
  return local.intentos >= maxIntentos ? 'rendirse' : 'reintentar'
}

/**
 * El texto que recibe el modelo. Va por la entrada estándar, nunca dentro del
 * comando: un encargo lo escribe una persona, y un texto metido en una línea
 * de terminal podría ejecutarse como orden.
 */
export function armarPrompt(encargo, { agente, crm }) {
  return [
    `Eres ${agente}, un agente del equipo de Tryvex. Este encargo te lo aprobó una persona desde el CRM (Vex Intelligence).`,
    `Tipo: ${encargo.tipo} · Prioridad: ${encargo.prioridad}`,
    `Título: ${encargo.titulo}`,
    encargo.detalle?.trim() ? `\nDetalle:\n${encargo.detalle.trim()}` : '',
    '',
    `Si necesitas algo del CRM (las directivas del equipo, el chat, tus rutinas), tu identidad ya está configurada: variables TRYVEX_CRM_URL y TRYVEX_AGENTE_TOKEN o TRYVEX_TOKEN_FILE. Empieza por GET ${crm}/api/agentes/manual, que lista todo lo que puedes hacer.`,
    '',
    'Tu respuesta final es lo que el equipo va a leer en el CRM: di qué hiciste, cómo lo verificaste y qué quedó pendiente. Si no se pudo, dilo y explica por qué. No inventes resultados.',
  ].join('\n')
}

function recortar(texto) {
  return texto.length > MAX_RESPUESTA
    ? `${texto.slice(0, MAX_RESPUESTA)}\n\n[…recortado por largo]`
    : texto
}

/**
 * Lo que se escribe en el CRM según cómo terminó el ejecutor. Nunca un "listo"
 * vacío: si el modelo no dijo nada, se dice eso.
 *
 * @param {{ codigo: number | null, salida: string, error: string, vencido: boolean, minutos: number }} r
 */
export function armarRespuesta(r) {
  const salida = r.salida.trim()
  if (r.vencido) {
    return recortar(`No se pudo completar: el ejecutor no terminó en ${r.minutos} min y se detuvo.${salida ? `\n\nLo último que alcanzó a decir:\n${salida.slice(-2000)}` : ''}`)
  }
  if (r.codigo !== 0) {
    const motivo = (r.error.trim() || salida).slice(-2000)
    return recortar(`No se pudo completar (el ejecutor salió con código ${r.codigo}).${motivo ? `\n\n${motivo}` : ' No dejó motivo.'}`)
  }
  return recortar(salida || 'El ejecutor terminó sin escribir nada. Revisar en la máquina del agente.')
}

/** La respuesta cuando se agotan los intentos. */
export function respuestaRendida(intentos) {
  return `No se pudo completar: se intentó ${intentos} veces y el ejecutor se cortó antes de terminar (la máquina se apagó o el proceso murió). Conviene revisarlo a mano antes de volver a encargarlo.`
}

/**
 * Cuánto esperar hasta la próxima consulta. Con trabajo, se vuelve al mínimo;
 * ociosa, la espera crece hasta el máximo. Así un agente sin encargos consulta
 * pocas veces por hora, y uno activo responde rápido.
 */
export function siguienteEspera(actualMs, huboCambios, { minMs = 15_000, maxMs = 120_000 } = {}) {
  if (huboCambios) return minMs
  return Math.min(maxMs, Math.round(Math.max(actualMs, minMs) * 1.5))
}
