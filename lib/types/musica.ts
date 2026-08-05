import { z } from 'zod'

/**
 * Musica compartida en las llamadas.
 *
 * Todo lo que decide "en que segundo va la pista" vive en este archivo y en
 * ninguna otra parte. Es a proposito: si el servidor calculara la posicion de una
 * manera y el navegador de otra, la desincronizacion aparecería solo cuando dos
 * personas estan escuchando a la vez -- o sea, nunca en desarrollo y siempre en
 * produccion. Al ser funciones puras, ademas, se pueden probar sin base ni
 * navegador (ver `musica.test.ts`).
 */

// ── Pista y sala ────────────────────────────────────────────────────────────

export type Pista = {
  video_id: string
  titulo: string
  canal: string
  /** Segundos. 0 = en vivo o desconocido; el reproductor no puede avanzar solo. */
  duracion_seg: number
  miniatura_url: string | null
  /** Quien la puso, para mostrarlo al lado del titulo en la cola. */
  puesta_por: string | null
}

export type ModoLoop = 'off' | 'pista' | 'cola'

export type SalaMusica = {
  conversacion_id: string
  video_id: string | null
  titulo: string | null
  canal: string | null
  duracion_seg: number | null
  miniatura_url: string | null
  cola: Pista[]
  historial: Pista[]
  empezo_at: string | null
  offset_seg: number
  pausado: boolean
  modo_loop: ModoLoop
  puesta_por: string | null
  actualizado_at: string
}

/** Los campos que un comando puede reescribir. Nunca la PK ni `actualizado_at`. */
export type CambioSala = Partial<Omit<SalaMusica, 'conversacion_id' | 'actualizado_at'>>

export function salaVacia(conversacionId: string): SalaMusica {
  return {
    conversacion_id: conversacionId,
    video_id: null,
    titulo: null,
    canal: null,
    duracion_seg: null,
    miniatura_url: null,
    cola: [],
    historial: [],
    empezo_at: null,
    offset_seg: 0,
    pausado: false,
    modo_loop: 'off',
    puesta_por: null,
    actualizado_at: new Date(0).toISOString(),
  }
}

/** La pista que suena ahora mismo, o null si la sala esta en silencio. */
export function pistaActual(sala: SalaMusica): Pista | null {
  if (!sala.video_id) return null
  return {
    video_id: sala.video_id,
    titulo: sala.titulo ?? 'Sin titulo',
    canal: sala.canal ?? '',
    duracion_seg: sala.duracion_seg ?? 0,
    miniatura_url: sala.miniatura_url,
    puesta_por: sala.puesta_por,
  }
}

/** El cambio que deja a `pista` sonando desde el segundo cero. */
function ponerPista(pista: Pista, ahora: Date): CambioSala {
  return {
    video_id: pista.video_id,
    titulo: pista.titulo,
    canal: pista.canal,
    duracion_seg: pista.duracion_seg,
    miniatura_url: pista.miniatura_url,
    puesta_por: pista.puesta_por,
    // Cambiar de pista reinicia el reloj entero. Si `offset_seg` sobreviviera,
    // la cancion nueva arrancaria en el minuto en que iba la anterior.
    empezo_at: ahora.toISOString(),
    offset_seg: 0,
    pausado: false,
  }
}

const SILENCIO: CambioSala = {
  video_id: null,
  titulo: null,
  canal: null,
  duracion_seg: null,
  miniatura_url: null,
  puesta_por: null,
  empezo_at: null,
  offset_seg: 0,
  pausado: false,
}

// ── El corazon: donde va la aguja ───────────────────────────────────────────

/**
 * En que segundo de la pista deberia ir todo el mundo.
 *
 * Pausado o sin reloj arrancado, la posicion es el offset congelado. Sonando, es
 * el offset mas lo que paso desde `empezo_at`. Se recorta a la duracion para que
 * una pista terminada no devuelva un numero que crece para siempre -- ese numero
 * llegaria a `seekTo` y el reproductor se quedaria golpeando el final.
 */
export function posicionActual(sala: SalaMusica, ahora: Date): number {
  if (!sala.video_id) return 0

  const base = Math.max(0, sala.offset_seg)
  if (sala.pausado || !sala.empezo_at) return recortar(base, sala.duracion_seg)

  const transcurrido = (ahora.getTime() - new Date(sala.empezo_at).getTime()) / 1000
  // Un `empezo_at` en el futuro (relojes desfasados entre el servidor y el
  // navegador) daria un transcurrido negativo y mandaria la aguja hacia atras.
  return recortar(base + Math.max(0, transcurrido), sala.duracion_seg)
}

function recortar(posicion: number, duracion: number | null): number {
  if (!duracion || duracion <= 0) return posicion
  return Math.min(posicion, duracion)
}

/** Tolerancia por defecto, en segundos. Ver `hayQueSaltar`. */
export const TOLERANCIA_SEG = 2

/**
 * Corregir o no corregir.
 *
 * Un `seekTo` produce un salto audible: corta el audio y lo retoma. Perseguir
 * cada decima de segundo suena peor que ir 300 ms desalineado con el resto, que
 * es algo que el oido humano no distingue entre dos parlantes de piezas
 * distintas. Solo se corrige cuando el desfase ya es evidente.
 */
export function hayQueSaltar(
  posicionReproductor: number,
  posicionEsperada: number,
  toleranciaSeg: number = TOLERANCIA_SEG,
): boolean {
  return Math.abs(posicionReproductor - posicionEsperada) > toleranciaSeg
}

/** La pista termino (o esta a punto). Se usa para disparar el avance de cola. */
export function pistaTerminada(sala: SalaMusica, ahora: Date): boolean {
  if (!sala.video_id || sala.pausado) return false
  const duracion = sala.duracion_seg ?? 0
  // Sin duracion conocida (un directo) no hay final que detectar: avanzar seria
  // cortar la transmision sola cada dos segundos.
  if (duracion <= 0) return false
  return posicionActual(sala, ahora) >= duracion
}

// ── Comandos ────────────────────────────────────────────────────────────────

export const COMANDOS = [
  'play',
  'pause',
  'resume',
  'skip',
  'previous',
  'queue',
  'loop',
  'shuffle',
  'stop',
  'nowplaying',
] as const

export type Comando = (typeof COMANDOS)[number]

/** Comandos que solo leen. No tocan la sala, asi que no necesitan escritura. */
export const COMANDOS_DE_LECTURA: readonly Comando[] = ['queue', 'nowplaying']

export const PistaSchema = z.object({
  video_id: z.string().min(1).max(64),
  titulo: z.string().min(1).max(300),
  canal: z.string().max(200).default(''),
  duracion_seg: z.number().int().min(0).max(86_400).default(0),
  miniatura_url: z.string().url().nullable().default(null),
  puesta_por: z.string().uuid().nullable().default(null),
})

export const ComandoMusicaSchema = z.object({
  conversacion_id: z.string().uuid(),
  comando: z.enum(COMANDOS),
  /**
   * Lo que acompaña al comando: la pista en `play`, el modo en `loop`. Va como
   * union y no como `unknown` para que un `/loop { pista entera }` se rechace en
   * el borde y no adentro del reductor.
   */
  argumento: z.union([PistaSchema, z.enum(['off', 'pista', 'cola'])]).optional(),
})

export type ComandoMusicaInput = z.infer<typeof ComandoMusicaSchema>

export type ResultadoComando = {
  /** Lo que hay que escribir en la sala. Vacio = el comando no cambia nada. */
  cambio: CambioSala
  /** Frase corta para mostrarle a quien escribio el comando. */
  mensaje: string
}

/**
 * El reductor: comando + sala actual -> sala nueva.
 *
 * Es puro y devuelve solo el delta. La ruta se limita a persistirlo, asi que la
 * logica de "que pasa cuando termina una pista en modo cola" existe una sola vez
 * y se puede probar sin base de datos.
 */
export function aplicarComando(
  sala: SalaMusica,
  comando: Comando,
  ahora: Date,
  opciones?: { pista?: Pista; modo?: ModoLoop; aleatorio?: () => number },
): ResultadoComando {
  const actual = pistaActual(sala)

  switch (comando) {
    case 'play': {
      const pista = opciones?.pista
      if (!pista) return { cambio: {}, mensaje: 'Falta la pista' }

      // Con algo sonando, `play` ENCOLA. Interrumpir es lo que nadie espera de un
      // bot de musica: uno agrega su cancion y espera su turno.
      if (actual) {
        return {
          cambio: { cola: [...sala.cola, pista] },
          mensaje: `En cola (#${sala.cola.length + 1}): ${pista.titulo}`,
        }
      }
      return { cambio: ponerPista(pista, ahora), mensaje: `Suena: ${pista.titulo}` }
    }

    case 'pause': {
      if (!actual || sala.pausado) return { cambio: {}, mensaje: 'No hay nada sonando' }
      // Se congela la posicion alcanzada. Sin esto, reanudar volveria al segundo
      // en que se puso la pista.
      return {
        cambio: { pausado: true, offset_seg: Math.floor(posicionActual(sala, ahora)), empezo_at: null },
        mensaje: 'Pausado',
      }
    }

    case 'resume': {
      if (!actual || !sala.pausado) return { cambio: {}, mensaje: 'No hay nada pausado' }
      // El offset se conserva tal cual: el reloj vuelve a correr desde ahora,
      // pero desde el segundo donde habia quedado.
      return { cambio: { pausado: false, empezo_at: ahora.toISOString() }, mensaje: 'Reanudado' }
    }

    case 'skip': {
      if (!actual) return { cambio: {}, mensaje: 'No hay nada sonando' }
      return { cambio: siguiente(sala, ahora, { forzada: true }), mensaje: 'Saltada' }
    }

    case 'previous': {
      const [anterior, ...resto] = sala.historial
      if (!anterior) return { cambio: {}, mensaje: 'No hay nada antes' }
      return {
        cambio: {
          ...ponerPista(anterior, ahora),
          historial: resto,
          // La que sonaba pasa al frente de la cola: volver atras no debe borrarla.
          cola: actual ? [actual, ...sala.cola] : sala.cola,
        },
        mensaje: `Volviendo a: ${anterior.titulo}`,
      }
    }

    case 'stop': {
      return { cambio: { ...SILENCIO, cola: [] }, mensaje: 'Detenido y cola vacia' }
    }

    case 'loop': {
      const modo = opciones?.modo ?? siguienteModo(sala.modo_loop)
      return { cambio: { modo_loop: modo }, mensaje: `Repeticion: ${modo}` }
    }

    case 'shuffle': {
      if (sala.cola.length < 2) return { cambio: {}, mensaje: 'La cola es muy corta para mezclar' }
      return {
        cambio: { cola: mezclar(sala.cola, opciones?.aleatorio) },
        mensaje: `Cola mezclada (${sala.cola.length})`,
      }
    }

    case 'queue': {
      if (sala.cola.length === 0) return { cambio: {}, mensaje: 'La cola esta vacia' }
      const lista = sala.cola.map((p, i) => `${i + 1}. ${p.titulo}`).join(' · ')
      return { cambio: {}, mensaje: lista }
    }

    case 'nowplaying': {
      if (!actual) return { cambio: {}, mensaje: 'No hay nada sonando' }
      const pos = Math.floor(posicionActual(sala, ahora))
      return {
        cambio: {},
        mensaje: `${actual.titulo} — ${reloj(pos)} / ${reloj(actual.duracion_seg)}`,
      }
    }
  }
}

/** El ciclo del boton de repetir, en el orden en que se espera al apretarlo. */
function siguienteModo(modo: ModoLoop): ModoLoop {
  return modo === 'off' ? 'pista' : modo === 'pista' ? 'cola' : 'off'
}

/**
 * Que suena despues de la actual.
 *
 * `forzada` distingue saltar a mano de que la pista se haya acabado sola, y solo
 * cambia una cosa: con `modo_loop = 'pista'`, saltar tiene que salir del bucle.
 * Si no, apretar "siguiente" con la repeticion puesta no haria absolutamente
 * nada y parece que el boton esta roto.
 */
export function siguiente(sala: SalaMusica, ahora: Date, opciones?: { forzada?: boolean }): CambioSala {
  const actual = pistaActual(sala)

  if (sala.modo_loop === 'pista' && actual && !opciones?.forzada) {
    return { empezo_at: ahora.toISOString(), offset_seg: 0, pausado: false }
  }

  const [proxima, ...resto] = sala.cola
  // El historial se recorta a 20: es para el boton de "atras", no un registro de
  // lo que escucho el equipo. Una fila JSONB que crece sin techo termina pesando
  // mas que todo lo demas de la tabla junto.
  const historial = actual ? [actual, ...sala.historial].slice(0, 20) : sala.historial

  if (proxima) {
    return {
      ...ponerPista(proxima, ahora),
      cola: sala.modo_loop === 'cola' && actual ? [...resto, actual] : resto,
      historial,
    }
  }

  // Cola vacia. Con `modo_loop = 'cola'` la unica pista que queda es la actual, y
  // repetirla es exactamente lo que se pidio.
  if (sala.modo_loop === 'cola' && actual) {
    return { empezo_at: ahora.toISOString(), offset_seg: 0, pausado: false }
  }

  return { ...SILENCIO, historial }
}

/**
 * Fisher-Yates. El generador se inyecta para poder probar la mezcla: con
 * `Math.random()` adentro, el test solo podria comprobar que no se pierde ninguna
 * pista, nunca que el algoritmo es correcto.
 */
export function mezclar(cola: Pista[], aleatorio: () => number = Math.random): Pista[] {
  const copia = [...cola]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/**
 * Quien de los presentes es el encargado de avanzar la cola cuando termina una
 * pista.
 *
 * Todos los navegadores detectan el final al mismo tiempo, asi que si todos
 * mandaran el avance, una cola de cinco personas saltaria cinco pistas de golpe.
 * Se elige al del UUID menor: es una regla determinista que los cinco clientes
 * calculan igual sin hablarlo, y no necesita un lider elegido ni un lock. El
 * mismo truco que `debeOfrecer` usa en las llamadas para evitar el glare.
 *
 * Si el encargado cierra la pestaña, el siguiente en orden pasa a serlo solo,
 * porque desaparece de `presentes`.
 */
export function mandaAvanzar(miId: string, presentes: string[]): boolean {
  if (presentes.length === 0) return true
  return presentes.every((id) => miId <= id)
}

// ── Utilidades de texto ─────────────────────────────────────────────────────

/**
 * La clave del cache. Sin esto, "Bohemian Rhapsody" y "bohemian  rhapsody" serian
 * dos entradas distintas y cada una costaria 100 de las 10.000 unidades diarias.
 */
export function normalizarConsulta(consulta: string): string {
  return consulta.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * El id de video de una URL de YouTube, o null si no es una.
 *
 * Importa porque una URL se resuelve con `videos.list` (1 unidad) en vez de
 * `search.list` (100). Pegar el link es el camino barato y el unico que sigue
 * funcionando cuando la cuota de busqueda ya se acabo.
 */
export function extraerVideoId(texto: string): string | null {
  const limpio = texto.trim()
  if (/^[\w-]{11}$/.test(limpio)) return limpio

  let url: URL
  try {
    url = new URL(limpio)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '')

  if (host === 'youtu.be') return validarId(url.pathname.slice(1))
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null

  if (url.pathname === '/watch') return validarId(url.searchParams.get('v') ?? '')
  const conPrefijo = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?]+)/)
  if (conPrefijo) return validarId(conPrefijo[2])

  return null
}

function validarId(candidato: string): string | null {
  return /^[\w-]{11}$/.test(candidato) ? candidato : null
}

/** `PT4M13S` -> 253. Es el formato en que YouTube devuelve las duraciones. */
export function duracionISOaSegundos(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/)
  if (!m) return 0
  const [, d, h, min, s] = m
  return (
    Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Math.floor(Number(s ?? 0))
  )
}

/** Segundos a `m:ss` o `h:mm:ss`. Para el "3:47 / 5:55" del reproductor. */
export function reloj(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Lee una linea del chat que empieza con `/` y la convierte en comando.
 *
 * Devuelve `null` si no es un comando y `{ comando: null }` si empieza con `/`
 * pero el comando no existe. Son casos distintos: el primero es un mensaje
 * normal y el segundo hay que avisarlo, no publicarlo -- si no, un `/plya` mal
 * escrito queda para siempre en la conversacion.
 */
export function leerComando(texto: string): { comando: Comando | null; argumento: string; crudo: string } | null {
  const limpio = texto.trim()
  if (!limpio.startsWith('/')) return null

  const [cabeza, ...resto] = limpio.slice(1).split(/\s+/)
  const nombre = cabeza.toLowerCase()
  const argumento = resto.join(' ')

  // Alias que la gente escribe por costumbre de otros bots.
  const alias: Record<string, Comando> = {
    p: 'play',
    s: 'skip',
    next: 'skip',
    prev: 'previous',
    q: 'queue',
    np: 'nowplaying',
    repeat: 'loop',
    disconnect: 'stop',
  }

  const comando = (COMANDOS as readonly string[]).includes(nombre)
    ? (nombre as Comando)
    : (alias[nombre] ?? null)

  return { comando, argumento, crudo: nombre }
}
