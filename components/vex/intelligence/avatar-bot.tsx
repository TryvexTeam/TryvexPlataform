'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

/**
 * Dibuja un bot a partir de su definición `.avatar.json`.
 *
 * El archivo es un DATO exportado del estudio de avatares, no su programa: acá
 * no hay una línea de su código. Este renderizador es nuestro, y por eso el CRM
 * no hereda la licencia AGPL del motor original.
 *
 * ── De dónde sale el volumen ──────────────────────────────────────────────
 *
 * No hay sombras ni degradados: el cuerpo es un color plano. Lo que da la
 * sensación de cabeza en tres dimensiones es la PERSPECTIVA DE LOS OJOS.
 *
 * Los ojos viven sobre la superficie de una esfera. Cuando la cabeza gira
 * `head.y` grados, cada ojo recorre esa curva: se desplaza de lado y, al
 * acercarse al borde, se ve de canto — o sea, se ANGOSTA. Esa compresión es un
 * coseno, y es todo el truco. Dos cápsulas iguales y centradas dan una
 * calcomanía; estas dos dan una cabeza que mira.
 *
 * `head.x` inclina arriba/abajo (sube los ojos y los achata), y `head.z` ladea
 * la cara entera.
 *
 * ── Cómo se anima ─────────────────────────────────────────────────────────
 *
 * Cada ojo es un rectángulo de tamaño FIJO centrado en el origen, y todo lo
 * demás se expresa como `transform`. Eso importa: los atributos de SVG
 * (`width`, `height`) no se pueden transicionar con CSS, pero `transform` sí.
 * Así el paso de una expresión a otra lo interpola el navegador, gratis y
 * suave, sin un bucle de animación en JavaScript.
 */

const OJO_ANCHO_BASE = 20
const OJO_ALTO_BASE = 50

interface Ojo {
  width: number
  height: number
  x: number
  y: number
  angle: number
}

interface Expresion {
  head: { x: number; y: number; z: number }
  eyes: { left: Ojo; right: Ojo; spacing: number }
  perspective: number
  motion?: { eyes?: string; body?: string }
  colors?: { body?: string; eyes?: string }
}

interface PasoAnimacion {
  expression: string
  holdMs: number
  transitionMs: number
}

interface Animacion {
  playbackMode: string
  steps: PasoAnimacion[]
  blink?: {
    enabled: boolean
    initialDelayMs: number
    minIntervalMs: number
    maxIntervalMs: number
    durationMs: number
  }
}

type TipoSuperficie = 'sphere' | 'cube' | 'capsule' | 'cone' | 'cylinder'

interface Superficie {
  type: TipoSuperficie
  width: number
  height: number
  depth: number
  roundness: number
}

interface NodoCuerpo {
  surface: Superficie
  position: [number, number, number]
  rotation: [number, number, number]
}

interface CuerpoRenderizable {
  primary: Superficie
  nodes: NodoCuerpo[]
}

export interface DefinicionAvatar {
  name: string
  body: { primary: { width: number; height: number; roundness: number } }
  colors: { body: string; eyes: string }
  expressions: Record<string, Expresion>
  animations: Record<string, Animacion>
}

interface AvatarBotProps {
  definicion: DefinicionAvatar
  /** Nombre de una animación del archivo: working, idle, listening, sleeping… */
  animacion?: string
  /** Lado del cuadro, en píxeles. */
  tamano?: number
  /** Pinta el cuerpo con otro color sin tocar la definición. */
  colorCuerpo?: string
  etiqueta?: string
}

export function AvatarBot({
  definicion,
  animacion = 'idle',
  tamano = 48,
  colorCuerpo,
  etiqueta,
}: AvatarBotProps) {
  const anim = definicion.animations[animacion] ?? definicion.animations.idle
  // Memorizado a propósito: sin esto se crea un array nuevo en cada render, el
  // efecto de abajo lo ve como dependencia cambiada y vuelve a programar los
  // temporizadores una y otra vez — los pasos no llegaban a cumplirse nunca y
  // la animación se quedaba clavada en el primero.
  const pasos = useMemo(
    () =>
      anim?.steps?.length
        ? anim.steps
        : [{ expression: 'neutral', holdMs: 4000, transitionMs: 500 }],
    [anim],
  )

  // Los gradientes se referencian por id, y en una pantalla hay cinco bots a la
  // vez: sin un id propio por instancia, todos usarían el degradado del primero.
  const idUnico = useId().replace(/:/g, '')

  const [paso, setPaso] = useState(0)
  const [parpadeando, setParpadeando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * La mirada sigue al cursor.
   *
   * Es el motivo por el que valió la pena hacer bien la perspectiva: la cabeza
   * ya sabe girar, así que basta con decirle hacia dónde. Con cinco bots en
   * pantalla, los cinco siguen a la persona — y la sala deja de ser una lámina
   * para volverse un lugar donde hay alguien.
   *
   * Un solo `requestAnimationFrame` por movimiento: sin eso, un puntero rápido
   * dispara cientos de renders por segundo y el panel se arrastra.
   */
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [mirada, setMirada] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cuadro = 0

    const alMover = (evento: PointerEvent) => {
      if (cuadro) return
      cuadro = requestAnimationFrame(() => {
        cuadro = 0
        const elemento = svgRef.current
        if (!elemento) return

        const caja = elemento.getBoundingClientRect()
        const centroX = caja.left + caja.width / 2
        const centroY = caja.top + caja.height / 2

        // Se satura a 420 px: más lejos que eso, el bot ya está mirando al tope
        // y seguir girando se vería como un tic.
        const dx = Math.max(-1, Math.min(1, (evento.clientX - centroX) / 420))
        const dy = Math.max(-1, Math.min(1, (evento.clientY - centroY) / 420))

        setMirada({ x: dy * -14, y: dx * 26 })
      })
    }

    window.addEventListener('pointermove', alMover, { passive: true })
    return () => {
      window.removeEventListener('pointermove', alMover)
      if (cuadro) cancelAnimationFrame(cuadro)
    }
  }, [])

  // Al cambiar de animación se vuelve al primer paso. Se ajusta DURANTE el
  // render y no con un efecto: hacerlo en el efecto provoca un render de más
  // con el paso viejo, que se ve como un parpadeo del gesto. Mismo patrón que
  // `panel-ajustes.tsx` en este repo.
  const [animacionVista, setAnimacionVista] = useState(animacion)
  if (animacion !== animacionVista) {
    setAnimacionVista(animacion)
    setPaso(0)
  }

  // Recorre los pasos de la animación. Cada paso dura lo suyo; el navegador
  // interpola el camino entre uno y otro.
  useEffect(() => {
    if (pasos.length < 2) return

    let vivo = true
    let indice = 0

    const siguiente = () => {
      if (!vivo) return
      indice = (indice + 1) % pasos.length
      setPaso(indice)
      temporizador.current = setTimeout(siguiente, pasos[indice].holdMs)
    }

    temporizador.current = setTimeout(siguiente, pasos[0].holdMs)
    return () => {
      vivo = false
      if (temporizador.current) clearTimeout(temporizador.current)
    }
  }, [animacion, pasos])

  // Parpadeo con intervalos irregulares: un parpadeo a compás se nota falso.
  useEffect(() => {
    const cfg = anim?.blink
    if (!cfg?.enabled) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let vivo = true
    let id: ReturnType<typeof setTimeout>

    const programar = (espera: number) => {
      id = setTimeout(() => {
        if (!vivo) return
        setParpadeando(true)
        setTimeout(() => {
          if (!vivo) return
          setParpadeando(false)
          const rango = cfg.maxIntervalMs - cfg.minIntervalMs
          programar(cfg.minIntervalMs + Math.random() * rango)
        }, cfg.durationMs)
      }, espera)
    }

    programar(cfg.initialDelayMs)
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [anim])

  /*
    El índice se acota SIEMPRE al largo real.

    Al cambiar de animación se pide volver al paso 0, pero React termina de
    ejecutar el render en curso antes de rehacerlo: en ese tramo el índice viejo
    sigue vigente, y si la animación nueva tiene menos pasos apunta a la nada.
    Eso reventaba el componente entero —`undefined.expression`— y la pantalla
    caía en el error boundary apenas alguien movía el cursor.
  */
  const pasoActual = pasos[Math.min(paso, pasos.length - 1)] ?? pasos[0]

  const expresion =
    definicion.expressions[pasoActual.expression] ?? definicion.expressions.neutral
  const transicion = pasoActual.transitionMs ?? 500

  const geometria = useMemo(
    () => calcular(expresion, definicion, mirada),
    [expresion, definicion, mirada],
  )

  const cuerpo = colorCuerpo ?? expresion.colors?.body ?? definicion.colors.body
  const ojos = expresion.colors?.eyes ?? definicion.colors.eyes
  const cuerpoDef = definicion.body as CuerpoRenderizable
  const nodosTraseros = cuerpoDef.nodes.filter((nodo) => nodo.position[2] < 0)
  const nodosDelanteros = cuerpoDef.nodes.filter((nodo) => nodo.position[2] >= 0)
  const viewBox = calcularViewBox(cuerpoDef)

  const dibujarNodo = (nodo: NodoCuerpo, indice: number) => {
    const [x, y] = nodo.position
    const giro = nodo.rotation[2]

    return (
      <g
        key={indice}
        fill={cuerpo}
        transform={`rotate(${giro} ${x} ${y})`}
        style={{ transition: `fill ${transicion}ms ease` }}
      >
        {formaDe(nodo.surface, x, y)}
      </g>
    )
  }

  return (
    <svg
      ref={svgRef}
      width={tamano}
      height={tamano}
      viewBox={viewBox}
      role="img"
      aria-label={etiqueta ?? definicion.name}
      style={{ display: 'block', flex: 'none' }}
    >
      {/*
        Dos capas que no cambian la silueta pero la sacan del plano.

        El cuerpo sigue siendo de color PLANO, como en la referencia — nada de
        pintarlo con un degradado, que lo convertiría en una bola de billar.
        Lo que se agrega es lo que hay alrededor de un cuerpo real: una sombra
        que lo apoya en el suelo y un brillo donde le pega la luz.

        Sobre fondo claro esto es lo que separa un objeto de una calcomanía.
      */}
      <defs>
        <radialGradient id={`brillo-${idUnico}`} cx="35%" cy="28%" r="52%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`sombra-${idUnico}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.26" />
          <stop offset="70%" stopColor="#000000" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* La sombra va primero: queda debajo de todo, incluso de las piezas. */}
      <ellipse
        cx="0"
        cy={cuerpoDef.primary.height / 2 + 6}
        rx={cuerpoDef.primary.width * 0.42}
        ry={cuerpoDef.primary.height * 0.085}
        fill={`url(#sombra-${idUnico})`}
      />

      {nodosTraseros.map(dibujarNodo)}

      <g
        fill={cuerpo}
        style={{ transition: `fill ${transicion}ms ease` }}
      >
        {formaDe(cuerpoDef.primary, 0, 0)}
      </g>

      {nodosDelanteros.map(dibujarNodo)}

      {/* El brillo es la MISMA silueta pintada con el degradado encima, así que
          respeta la forma sea esfera, cubo, cápsula o cono, sin recortes. Va
          detrás de los ojos: la luz cae sobre la cara, no sobre la mirada. */}
      <g fill={`url(#brillo-${idUnico})`} style={{ pointerEvents: 'none' }}>
        {formaDe(cuerpoDef.primary, 0, 0)}
      </g>

      <g style={{ transform: `rotate(${expresion.head.z}deg)`, transition: `transform ${transicion}ms ease` }}>
        {geometria.map((ojo, i) => (
          <rect
            key={i}
            x={-OJO_ANCHO_BASE / 2}
            y={-OJO_ALTO_BASE / 2}
            width={OJO_ANCHO_BASE}
            height={OJO_ALTO_BASE}
            rx={OJO_ANCHO_BASE / 2}
            fill={ojos}
            style={{
              transform: `translate(${ojo.px}px, ${ojo.py}px) rotate(${ojo.rot}deg) scale(${ojo.sx}, ${parpadeando ? 0.06 : ojo.sy})`,
              // 260 ms y no los 500 de la expresión: la mirada tiene que ir casi
              // a la par del cursor. Medio segundo de retraso se siente como un
              // bot distraído, no como uno que te mira.
              transition: `transform ${parpadeando ? 90 : Math.min(transicion, 260)}ms ease, fill ${transicion}ms ease`,
            }}
          />
        ))}
      </g>
    </svg>
  )
}

function formaDe(surface: Superficie, cx: number, cy: number) {
  const x = cx - surface.width / 2
  const y = cy - surface.height / 2

  switch (surface.type) {
    case 'sphere':
      return <ellipse cx={cx} cy={cy} rx={surface.width / 2} ry={surface.height / 2} />
    case 'cube':
      return (
        <rect
          x={x}
          y={y}
          width={surface.width}
          height={surface.height}
          rx={(Math.min(surface.width, surface.height) / 2) * surface.roundness}
        />
      )
    case 'capsule':
    case 'cylinder':
      return <rect x={x} y={y} width={surface.width} height={surface.height} rx={surface.width / 2} />
    case 'cone': {
      const punta = Math.max(1, Math.min(surface.width, surface.height) * 0.025)
      const arriba = y
      const abajo = y + surface.height
      const izquierda = x
      const derecha = x + surface.width

      return (
        <path
          d={[
            `M ${cx - punta} ${arriba + punta}`,
            `Q ${cx} ${arriba} ${cx + punta} ${arriba + punta}`,
            `C ${cx + surface.width * 0.16} ${arriba + surface.height * 0.18} ${derecha} ${abajo - surface.height * 0.28} ${derecha} ${abajo - surface.height * 0.14}`,
            `Q ${derecha} ${abajo} ${cx} ${abajo}`,
            `Q ${izquierda} ${abajo} ${izquierda} ${abajo - surface.height * 0.14}`,
            `C ${izquierda} ${abajo - surface.height * 0.28} ${cx - surface.width * 0.16} ${arriba + surface.height * 0.18} ${cx - punta} ${arriba + punta}`,
            'Z',
          ].join(' ')}
        />
      )
    }
  }
}

function calcularViewBox(cuerpo: CuerpoRenderizable): string {
  const limites = [
    limitesDe(cuerpo.primary, 0, 0, 0),
    ...cuerpo.nodes.map((nodo) =>
      limitesDe(nodo.surface, nodo.position[0], nodo.position[1], nodo.rotation[2]),
    ),
  ]
  const margen = 8
  const minX = Math.min(...limites.map((limite) => limite.minX)) - margen
  const minY = Math.min(...limites.map((limite) => limite.minY)) - margen
  const maxX = Math.max(...limites.map((limite) => limite.maxX)) + margen
  const maxY = Math.max(...limites.map((limite) => limite.maxY)) + margen

  return `${redondear(minX)} ${redondear(minY)} ${redondear(maxX - minX)} ${redondear(maxY - minY)}`
}

function limitesDe(surface: Superficie, cx: number, cy: number, grados: number) {
  const angulo = (grados * Math.PI) / 180
  const coseno = Math.abs(Math.cos(angulo))
  const seno = Math.abs(Math.sin(angulo))
  let mitadX: number
  let mitadY: number

  if (surface.type === 'sphere') {
    const radioX = surface.width / 2
    const radioY = surface.height / 2
    mitadX = Math.sqrt((radioX * coseno) ** 2 + (radioY * seno) ** 2)
    mitadY = Math.sqrt((radioX * seno) ** 2 + (radioY * coseno) ** 2)
  } else if (surface.type === 'capsule' || surface.type === 'cylinder') {
    const radio = Math.min(surface.width, surface.height) / 2
    const tramoX = surface.width / 2 - radio
    const tramoY = surface.height / 2 - radio
    mitadX = tramoX * coseno + tramoY * seno + radio
    mitadY = tramoX * seno + tramoY * coseno + radio
  } else {
    mitadX = (surface.width / 2) * coseno + (surface.height / 2) * seno
    mitadY = (surface.width / 2) * seno + (surface.height / 2) * coseno
  }

  return {
    minX: cx - mitadX,
    minY: cy - mitadY,
    maxX: cx + mitadX,
    maxY: cy + mitadY,
  }
}

/**
 * Proyecta los dos ojos sobre la esfera según hacia dónde mira la cabeza.
 *
 * `spacing` es la separación entre ojos medida sobre la superficie, así que
 * primero se convierte a un ángulo sobre la esfera; a ese ángulo se le suma el
 * giro de la cabeza y recién ahí se proyecta. Por eso al girar no se deslizan
 * en plano: recorren la curva, que es lo que se ve como volumen.
 */
function calcular(
  expresion: Expresion,
  def: DefinicionAvatar,
  mirada: { x: number; y: number } = { x: 0, y: 0 },
) {
  const radio = def.body.primary.width / 2
  // El giro de la expresión y el del cursor se SUMAN: el bot conserva su gesto
  // (escéptico, atento, dormido) mientras sigue a la persona con la vista.
  const giroY = ((expresion.head.y + mirada.y) * Math.PI) / 180
  const giroX = ((expresion.head.x + mirada.x) * Math.PI) / 180

  // Los ojos no se pegan al ecuador: quedan algo adelante, para que la cara
  // tenga frente. 0.62 del radio es donde se ven como en la referencia.
  const profundidad = 0.62

  return (['left', 'right'] as const).map((lado) => {
    const ojo = expresion.eyes[lado]
    const signo = lado === 'left' ? -1 : 1

    // Ángulo del ojo sobre la esfera, más el giro de la cabeza.
    const anguloBase = Math.asin(
      Math.min(1, (expresion.eyes.spacing / 2) / (radio * profundidad + 1e-6)),
    )
    const angulo = signo * anguloBase + giroY

    const px = radio * profundidad * Math.sin(angulo) + ojo.x
    const py = radio * profundidad * -Math.sin(giroX) + ojo.y

    // La compresión: de frente vale 1, de canto tiende a 0. El piso de 0.18
    // evita que el ojo desaparezca del todo en giros extremos.
    const compresion = Math.max(0.18, Math.cos(angulo))
    const achatado = Math.max(0.35, Math.cos(giroX))

    // Redondeo obligatorio: el servidor y el navegador imprimen los decimales
    // de un float con distinta precisión, y React lo reporta como desajuste de
    // hidratación. Tres decimales sobran para la vista y hacen que ambos lados
    // escriban exactamente el mismo texto.
    return {
      px: redondear(px),
      py: redondear(py),
      rot: redondear(ojo.angle),
      sx: redondear((ojo.width / OJO_ANCHO_BASE) * compresion),
      sy: redondear((ojo.height / OJO_ALTO_BASE) * achatado),
    }
  })
}

function redondear(n: number): number {
  return Math.round(n * 1000) / 1000
}
