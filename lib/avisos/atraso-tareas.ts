import { enviarPorVex } from '@/lib/wa/transporte'

/**
 * El aviso de tareas atrasadas que le llega a cada persona.
 *
 * Sale de algo que dijo Cristian el 11-sep-2026: *"mis compañeros de Tryvex no
 * hacen sus tareas —y me incluyo— como que no hay algo que nos obliga"*. Una
 * tarea vencida el 8 de septiembre hoy sigue ahí, callada, para siempre.
 *
 * El aviso va a la persona, no al grupo: la idea es que se entere, no
 * escracharla delante del resto.
 */

export interface TareaDeAviso {
  id: string
  titulo: string
  fecha_limite: string
}

export interface DestinatarioAviso {
  integrante_id: string
  nombre: string
  telefono: string | null
  tareas: TareaDeAviso[]
}

/** Días de Santiago que lleva vencida una fecha 'YYYY-MM-DD'. */
export function diasVencida(fecha: string, hoy = new Date()): number {
  const [a, m, d] = fecha.split('-').map(Number)
  const limite = new Date(a, (m ?? 1) - 1, d ?? 1)
  const inicioDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.round((inicioDeHoy.getTime() - limite.getTime()) / 86_400_000))
}

function plazo(dias: number): string {
  if (dias <= 0) return 'vence hoy'
  if (dias === 1) return '1 día'
  if (dias < 30) return `${dias} días`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? '1 mes' : `${meses} meses`
}

/**
 * El texto del WhatsApp.
 *
 * Tres reglas que vienen de cómo se habla en Chile (ver la investigación del
 * 31-ago): sin "IA", sin adornos y con el dolor concreto. Un mensaje que empieza
 * con "Hola! Te recordamos que..." se lee como spam de empresa y se ignora.
 *
 * Se nombran hasta tres tareas. Una lista de nueve no se lee: se cierra.
 */
export function textoDelAviso(d: DestinatarioAviso, hoy = new Date()): string {
  const nombre = d.nombre.split(' ')[0]
  const n = d.tareas.length
  const orden = [...d.tareas].sort((x, y) => x.fecha_limite.localeCompare(y.fecha_limite))
  const muestra = orden.slice(0, 3)

  const lineas = muestra.map((t) => `• ${t.titulo} (${plazo(diasVencida(t.fecha_limite, hoy))})`)
  const resto = n - muestra.length

  return [
    `${nombre}, ${n === 1 ? 'tienes una tarea pasada de fecha' : `tienes ${n} tareas pasadas de fecha`}:`,
    '',
    ...lineas,
    ...(resto > 0 ? [`• y ${resto} más`] : []),
    '',
    'Si ya no corresponde, ciérrala o cámbiale la fecha en el CRM. Si sigue viva, queda a la vista de todos en el tablero.',
  ].join('\n')
}

/**
 * Solo dígitos, para comparar dos teléfonos escritos distinto.
 * '+56 9 7359 3282' y '56973593282' son el mismo número.
 */
function soloDigitos(tel: string): string {
  return tel.replace(/\D/g, '')
}

/**
 * ¿Este número es el del propio WhatsApp desde el que mandamos?
 *
 * Pasó de verdad: el 11-sep Cristian pasó el número de Ignacio y resultó ser
 * **el mismo número de Tryvex** ("lo está usando así ahora hasta que tengamos
 * otro chip"). Mandarle el aviso sería que el CRM se escriba a sí mismo, y el
 * agente devolvería ese mensaje como entrante — un lead o un hilo fantasma
 * creado por nuestro propio recordatorio.
 *
 * Se compara contra `WA_NUMERO_PROPIO` si está configurado. Es una red, no un
 * reemplazo del criterio: lo correcto sigue siendo no cargar ese número como
 * teléfono personal de nadie.
 */
export function esElNumeroDeTryvex(telefono: string): boolean {
  const propio = process.env.WA_NUMERO_PROPIO
  if (!propio) return false
  const a = soloDigitos(telefono)
  const b = soloDigitos(propio)
  if (!a || !b) return false
  // Por la cola: uno puede venir con '+56' y el otro sin código de país.
  return a.endsWith(b) || b.endsWith(a)
}

export interface ResultadoAviso {
  integrante_id: string
  nombre: string
  tareas: number
  /** 'enviado' | 'simulado' (envío apagado) | 'sin-telefono' | 'numero-propio' | 'error' */
  estado: 'enviado' | 'simulado' | 'sin-telefono' | 'numero-propio' | 'error'
  detalle?: string
  texto: string
}

/**
 * ¿Se manda de verdad, o solo se muestra lo que se mandaría?
 *
 * **Apagado por defecto, a propósito.** El número de WhatsApp de Tryvex lo
 * administra Ignacio, y ese número ya se quemó una vez (18-ago) por escribir en
 * frío. Que un despliegue empiece a mandar mensajes solo, sin que nadie lo
 * decida, es exactamente el accidente que no queremos: el interruptor se
 * enciende a mano con `AVISOS_WA=on` cuando ellos digan.
 *
 * Con el envío apagado el cron corre igual y deja registrado, mensaje por
 * mensaje, qué habría mandado. Eso es lo que se revisa antes de encenderlo.
 */
export function envioWhatsappEncendido(): boolean {
  return process.env.AVISOS_WA === 'on'
}

/**
 * Manda (o simula) el aviso de cada persona.
 *
 * Nunca lanza: un WhatsApp que falla no puede tumbar el cron, porque el mismo
 * cron avisa además de entregas y cobros. Cada resultado se devuelve para que
 * quien llame lo registre.
 */
export async function enviarAvisosDeAtraso(
  destinatarios: DestinatarioAviso[],
  hoy = new Date(),
): Promise<ResultadoAviso[]> {
  const encendido = envioWhatsappEncendido()
  const salida: ResultadoAviso[] = []

  for (const d of destinatarios) {
    if (d.tareas.length === 0) continue
    const texto = textoDelAviso(d, hoy)
    const base = { integrante_id: d.integrante_id, nombre: d.nombre, tareas: d.tareas.length, texto }

    if (!d.telefono) {
      // Hoy (11-sep) le pasa a 2 de los 5: Fabián e Ignacio no tienen teléfono
      // cargado, y son justamente dos de los que más atraso acumulan. Se
      // reporta en vez de saltarlo en silencio.
      salida.push({ ...base, estado: 'sin-telefono' })
      continue
    }

    if (esElNumeroDeTryvex(d.telefono)) {
      // El CRM escribiéndose a sí mismo: el agente devolvería el mensaje como
      // entrante y crearía un hilo fantasma.
      salida.push({
        ...base,
        estado: 'numero-propio',
        detalle: 'Es el número desde el que mandamos: se omite para no escribirnos solos',
      })
      continue
    }

    if (!encendido) {
      salida.push({ ...base, estado: 'simulado' })
      continue
    }

    const res = await enviarPorVex(d.telefono, texto, d.nombre)
    salida.push({
      ...base,
      estado: res.ok ? 'enviado' : 'error',
      detalle: res.ok ? undefined : res.error,
    })
  }

  return salida
}
