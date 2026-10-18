/**
 * La conversación que muestra el teléfono de la vista previa de una demo.
 *
 * Es una simulación, y por eso tiene que ser HONESTA con lo que la demo real
 * hace: el asistente de la demo no conoce precios, stock ni disponibilidad
 * (ver `guion-demo.ts`), así que acá tampoco. Cuando el cliente pregunta el
 * precio, el asistente responde lo mismo que respondería de verdad: que se lo
 * confirma el equipo. Mostrarle al dueño un asistente que cotiza solo sería
 * venderle algo que la demo no va a hacer cuando la pruebe.
 *
 * El guion cambia con el rubro porque un dueño se reconoce en su propia
 * conversación: a una panadería le escriben por una torta, no por una hora.
 */

export type Autor = 'cliente' | 'asistente'

export interface MensajeSimulado {
  de: Autor
  texto: string
}

export type TipoFlujo = 'reserva' | 'encargo' | 'cotizacion' | 'consulta'

/** Sin tildes ni mayúsculas, para comparar rubros como los escribe Google. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

interface Perfil {
  tipo: TipoFlujo
  claves: string[]
  /** Lo que pide el cliente, dicho como lo diría él. */
  pedido: string
}

// El orden importa: gana la primera que calce.
const PERFILES: Perfil[] = [
  { tipo: 'reserva', claves: ['barber'], pedido: 'un corte y perfilado de barba' },
  { tipo: 'reserva', claves: ['peluquer', 'salon de belleza'], pedido: 'un corte y color' },
  { tipo: 'reserva', claves: ['estetica', 'manicur', 'spa'], pedido: 'una limpieza facial' },
  { tipo: 'reserva', claves: ['dentist', 'dental', 'odontolog'], pedido: 'una evaluación' },
  { tipo: 'reserva', claves: ['kinesiolog', 'clinic', 'medic', 'psicolog', 'nutricion'], pedido: 'una primera consulta' },
  { tipo: 'reserva', claves: ['veterinar'], pedido: 'un control para mi perro' },
  { tipo: 'reserva', claves: ['optic'], pedido: 'un examen de la vista' },
  { tipo: 'reserva', claves: ['restaur', 'cafeter', 'pizzer', 'sushi'], pedido: 'una mesa para 4 personas' },
  { tipo: 'reserva', claves: ['gimnasi', 'crossfit', 'pilates', 'yoga'], pedido: 'una clase de prueba' },
  { tipo: 'encargo', claves: ['panader', 'pasteler', 'reposter'], pedido: 'una torta para 15 personas' },
  { tipo: 'encargo', claves: ['florer', 'floris'], pedido: 'un ramo para regalar' },
  { tipo: 'cotizacion', claves: ['ferreter', 'materiales'], pedido: 'materiales para pintar una pieza' },
  { tipo: 'cotizacion', claves: ['taller', 'mecanic', 'automovil', 'vulcaniz'], pedido: 'una mantención para mi auto' },
  { tipo: 'cotizacion', claves: ['electricist', 'gasfiter'], pedido: 'revisar el tablero eléctrico de mi casa' },
  { tipo: 'cotizacion', claves: ['contador', 'contab'], pedido: 'llevar la contabilidad de mi pyme' },
]

export function perfilDeRubro(rubro: string | null | undefined): { tipo: TipoFlujo; pedido: string } {
  const r = normalizar(rubro ?? '')
  const p = r ? PERFILES.find((x) => x.claves.some((c) => r.includes(c))) : undefined
  return p ? { tipo: p.tipo, pedido: p.pedido } : { tipo: 'consulta', pedido: '' }
}

/**
 * El rubro escrito en el guion ("- Rubro: Barbería"). Así la vista previa
 * sigue al guion aunque el equipo lo haya editado a mano o no venga de un lead.
 */
export function rubroDelGuion(guion: string): string | null {
  const m = guion.match(/^\s*-\s*Rubro:\s*(.+?)\s*$/m)
  return m?.[1] ?? null
}

export function simularConversacion(nombreNegocio: string, rubro: string | null | undefined): MensajeSimulado[] {
  const nombre = nombreNegocio.trim() || 'su negocio'
  const { tipo, pedido } = perfilDeRubro(rubro)
  const saludo = `¡Hola! Te saluda el asistente de ${nombre} 👋`

  switch (tipo) {
    case 'reserva':
      return [
        { de: 'cliente', texto: `Hola, ¿tienen hora para ${pedido} mañana en la tarde?` },
        { de: 'asistente', texto: `${saludo} Claro, te ayudo a reservar. ¿Me dices tu nombre?` },
        { de: 'cliente', texto: 'Camila' },
        { de: 'asistente', texto: `Perfecto, Camila. Anoté ${pedido} para mañana en la tarde. El equipo te confirma la hora exacta por aquí.` },
        { de: 'cliente', texto: '¿Y cuánto sale?' },
        { de: 'asistente', texto: 'El valor te lo confirma el equipo junto con la hora, para darte el precio exacto 🙂' },
      ]
    case 'encargo':
      return [
        { de: 'cliente', texto: `Hola, ¿hacen ${pedido} por encargo?` },
        { de: 'asistente', texto: `${saludo} Sí, te ayudo con tu encargo. ¿Para qué día lo necesitas?` },
        { de: 'cliente', texto: 'Para el sábado en la mañana' },
        { de: 'asistente', texto: '¡Anotado! ¿A nombre de quién lo dejo?' },
        { de: 'cliente', texto: 'Javiera' },
        { de: 'asistente', texto: `Listo, Javiera: ${pedido}, para el sábado en la mañana. El equipo te confirma el encargo y el valor por aquí.` },
      ]
    case 'cotizacion':
      return [
        { de: 'cliente', texto: `Hola, ¿me pueden cotizar ${pedido}?` },
        { de: 'asistente', texto: `${saludo} Claro. ¿Me cuentas un poco más de lo que necesitas?` },
        { de: 'cliente', texto: 'Es para esta semana, si se puede' },
        { de: 'asistente', texto: 'Perfecto. ¿Me dejas tu nombre para la cotización?' },
        { de: 'cliente', texto: 'Rodrigo' },
        { de: 'asistente', texto: 'Gracias, Rodrigo. Le paso tu solicitud al equipo y te envían la cotización por aquí.' },
      ]
    case 'consulta':
      return [
        { de: 'cliente', texto: 'Hola, quería hacer una consulta' },
        { de: 'asistente', texto: `${saludo} Cuéntame, ¿en qué te puedo ayudar?` },
        { de: 'cliente', texto: '¿Hacen despacho a domicilio?' },
        { de: 'asistente', texto: 'Eso te lo confirma el equipo del local. ¿Me dejas tu nombre y comuna para que te escriban?' },
        { de: 'cliente', texto: 'Pedro, de Ñuñoa' },
        { de: 'asistente', texto: 'Anotado, Pedro. El equipo te escribe por aquí a la brevedad.' },
      ]
  }
}

/** Iniciales para el avatar del chat ("Barbería Gold" → "BG"). */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => /\p{L}/u.test(p))
  const letras = palabras.slice(0, 2).map((p) => p.match(/\p{L}/u)?.[0] ?? '')
  return letras.join('').toUpperCase() || '·'
}
