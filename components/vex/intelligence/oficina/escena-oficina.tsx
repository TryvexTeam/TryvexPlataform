'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, CameraControls, ContactShadows, Environment, Lightformer, PerformanceMonitor, RoundedBox } from '@react-three/drei'
import { Vector3 } from 'three'
import { distribuirConZonas, lugarFrenteAPantalla, type ZonaOficina } from '@/lib/agentes/distribucion-oficina'
import type { EncargoPantalla } from '@/lib/agentes/pantalla-cola'
import type { AgenteSala } from '@/lib/types/sala-agentes'
import { ANCHO_PANTALLA, PantallaCola } from './pantalla-cola'
import { ALTURA_HOLO, Puesto } from './robot'
import { ZonaConocimiento, ZonaDirectivas, ZonaWhatsapp } from './zonas-3d'

/**
 * La oficina en 3D: una isla abierta, sin muros, en el estilo de estudio claro
 * de SAMS. Al fondo, la pantalla grande de la Cola; los agentes van a mirarla
 * cuando se les encola o les cambia un encargo, y vuelven a su escritorio.
 *
 * Todo está hecho con formas simples y la luz de estudio se genera en el
 * propio código (Lightformer): nada se descarga de afuera. Los nombres y los
 * paneles son HTML encima del lienzo: la escena solo los mueve a su lugar en
 * cada cuadro (ver Proyector), y los nombres siguen al robot cuando camina.
 */

type Punto = [number, number, number]

export interface EscenaProps {
  agentes: AgenteSala[]
  encargos: EncargoPantalla[]
  seleccionado: string | null
  alSeleccionar: (id: string) => void
  /** false con "reducir movimiento" o fuera de pantalla: la escena no se anima. */
  animar: boolean
  /** Elementos HTML por clave: `n:<id>` nombre, `h:<id>` panel, `z:<zona>` cartel. */
  anclas: React.RefObject<Map<string, HTMLElement>>
  /** Cuánto hay en cada zona (documentos, sin leer, directivas). */
  zonas: Record<ZonaOficina, number>
  /** Por agente: sube cada vez que tiene que ir a mirar la pantalla. */
  visitas: Record<string, number>
  alIr: (zona: ZonaOficina) => void
  /** Cambia cada vez que se pide volver a ver la sala completa. */
  verSala: number
}

export default function EscenaOficina(props: EscenaProps) {
  const { agentes, encargos, seleccionado, alSeleccionar, animar, anclas, zonas, visitas, alIr, verSala } = props
  const dist = useMemo(() => distribuirConZonas(agentes.length), [agentes.length])
  const [ancho, fondo] = dist.sala

  // Lo fijo (paneles, carteles de zona) se calcula acá; lo que se mueve (los
  // nombres, que siguen al robot) lo anota cada robot en `dinamicas`.
  const fijas = useMemo(() => {
    const m = new Map<string, Punto>()
    agentes.forEach((a, i) => {
      const [x, z] = dist.puestos[i]
      m.set(`h:${a.id}`, [x, ALTURA_HOLO, z - 0.3])
    })
    for (const [zona, [x, z]] of Object.entries(dist.zonas)) {
      m.set(`z:${zona}`, zona === 'cola' ? [x, 0.05, z + 0.9] : [x, 0.05, z + 1.4])
    }
    return m
  }, [agentes, dist])
  const dinamicas = useRef(new Map<string, Punto>())

  const agentesPorId = useMemo(
    () => Object.fromEntries(agentes.map((a) => [a.id, { nombre: a.nombre, colorHex: a.colorHex }])),
    [agentes],
  )

  const camara = useMemo(() => {
    const d = Math.max(ancho * 0.62, fondo * 0.78) + 2
    return { pos: [d * 0.36, d * 0.58, d * 0.82] as Punto, d }
  }, [ancho, fondo])

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.5]}
      frameloop={animar ? 'always' : 'demand'}
      camera={{ position: camara.pos, fov: 32 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    >
      {/* Si el equipo no da abasto, baja la resolución sola en vez de trabarse. */}
      <PerformanceMonitor />
      <AdaptiveDpr pixelated={false} />

      {/* Luz de estudio generada en el propio código: reflejos suaves en el
          vinilo de los robots, sin descargar ningún mapa de entorno. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 4]} scale={[12, 5, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.1} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} color="#dbe7ff" />
        <Lightformer form="rect" intensity={0.9} position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} color="#ffe6d3" />
        <Lightformer form="ring" intensity={1.4} position={[0, 5, -6]} scale={3} color="#ffffff" />
      </Environment>

      <hemisphereLight args={['#ffffff', '#e2e8f0', 0.9]} />
      <directionalLight
        castShadow
        position={[ancho * 0.3, 14, fondo * 0.5]}
        intensity={1.6}
        color="#fff4e8"
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-ancho * 0.7}
        shadow-camera-right={ancho * 0.7}
        shadow-camera-top={fondo * 0.7}
        shadow-camera-bottom={-fondo * 0.7}
      />

      <Isla ancho={ancho} fondo={fondo} />

      {agentes.map((a, i) => (
        <Puesto
          key={a.id}
          agente={a}
          posicion={dist.puestos[i]}
          seleccionado={seleccionado === a.id}
          alSeleccionar={alSeleccionar}
          animar={animar}
          visita={visitas[a.id] ?? 0}
          frenteAPantalla={lugarFrenteAPantalla(i, agentes.length, dist.zonas.cola, ANCHO_PANTALLA)}
          posiciones={dinamicas}
        />
      ))}

      <PantallaCola posicion={dist.zonas.cola} encargos={encargos} agentes={agentesPorId} alTocar={() => alIr('cola')} animar={animar} />
      <ZonaConocimiento posicion={dist.zonas.conocimiento} cantidad={zonas.conocimiento} animar={animar} />
      <ZonaWhatsapp posicion={dist.zonas.whatsapp} cantidad={zonas.whatsapp} animar={animar} />
      <ZonaDirectivas posicion={dist.zonas.directivas} cantidad={zonas.directivas} animar={animar} />

      {/* Sombras de contacto: se calculan UNA vez (frames={1}). Recalcularlas en
          cada cuadro volvía a dibujar la escena entera y dejaba la oficina a 1
          cuadro por segundo en equipos sin tarjeta de video. La sombra de los
          robots que caminan la pone la luz principal. */}
      <ContactShadows frames={1} position={[0, 0.002, 0]} scale={Math.max(ancho, fondo) * 1.2} opacity={0.3} blur={2.4} far={2.5} resolution={512} />

      <Camara
        agentes={agentes}
        puestos={dist.puestos}
        seleccionado={seleccionado}
        verSala={verSala}
        inicio={camara.pos}
        distanciaMax={camara.d * 1.6}
      />
      <Proyector fijas={fijas} dinamicas={dinamicas} anclas={anclas} />
    </Canvas>
  )
}

/**
 * La cámara: se puede girar y acercar con el dedo o el mouse, y vuela sola
 * hasta el agente que se elige o de vuelta a la sala completa. En pantallas
 * angostas se aleja, para que la sala quepa de ancho.
 */
function Camara({
  agentes,
  puestos,
  seleccionado,
  verSala,
  inicio,
  distanciaMax,
}: {
  agentes: AgenteSala[]
  puestos: Array<[number, number]>
  seleccionado: string | null
  verSala: number
  inicio: Punto
  distanciaMax: number
}) {
  const controles = useRef<CameraControls>(null)
  const { size } = useThree()
  const lejania = Math.round(Math.max(1, 1.45 / (size.width / Math.max(size.height, 1))) * 10) / 10

  useEffect(() => {
    const c = controles.current
    if (!c) return
    const i = seleccionado ? agentes.findIndex((a) => a.id === seleccionado) : -1
    if (i >= 0) {
      const [x, z] = puestos[i]
      const f = Math.min(lejania, 1.6)
      // Encuadre del robot y su panel holográfico, que flota más arriba.
      void c.setLookAt(x + 2.8 * f, 2.6 + 2.2 * f, z + 7.4 * f, x, 2.5, z - 0.3, true)
    } else {
      void c.setLookAt(inicio[0] * lejania, inicio[1] * lejania, inicio[2] * lejania, 0, 0.6, -0.6, true)
    }
    // `agentes` cambia en cada refresco: la cámara solo se mueve cuando cambia
    // lo elegido, se pide ver la sala o cambia la forma de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado, verSala, lejania])

  return (
    <CameraControls
      ref={controles}
      makeDefault
      minPolarAngle={0.3}
      maxPolarAngle={1.22}
      minDistance={3.5}
      maxDistance={distanciaMax * lejania}
      smoothTime={0.5}
      truckSpeed={0}
    />
  )
}

/**
 * Ubica cada elemento HTML sobre su lugar de la escena, en cada cuadro. Lo que
 * se mueve (los nombres) manda sobre lo fijo. No crea nada: solo mueve
 * elementos que ya existen.
 */
function Proyector({
  fijas,
  dinamicas,
  anclas,
}: {
  fijas: Map<string, Punto>
  dinamicas: React.RefObject<Map<string, Punto>>
  anclas: React.RefObject<Map<string, HTMLElement>>
}) {
  const { camera, size } = useThree()
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const mapa = anclas.current
    if (!mapa) return
    for (const [clave, el] of mapa) {
      const p = dinamicas.current?.get(clave) ?? fijas.get(clave)
      if (!p) {
        ubicar(el, 0, 0, false)
        continue
      }
      v.set(p[0], p[1], p[2]).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const fuera = v.z > 1 || x < -200 || x > size.width + 200 || y < -200 || y > size.height + 200
      const margen = Math.min(90, size.width / 4)
      ubicar(el, Math.min(Math.max(x, margen), size.width - margen), y, !fuera)
    }
  })
  return null
}

/**
 * Mueve un elemento HTML a su punto de la pantalla. Está fuera de los
 * componentes a propósito: tocar el DOM directo es justamente lo que evita
 * volver a renderizar React sesenta veces por segundo.
 */
function ubicar(el: HTMLElement, x: number, y: number, visible: boolean) {
  el.style.opacity = visible ? '1' : '0'
  if (visible) el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
}

/**
 * La isla: una plataforma blanca flotante, con canto redondeado y una línea
 * de luz suave en el borde. Sin muros: la sala se lee de un vistazo.
 */
function Isla({ ancho, fondo }: { ancho: number; fondo: number }) {
  return (
    <group>
      <RoundedBox args={[ancho, 0.5, fondo]} radius={0.24} smoothness={6} position={[0, -0.25, 0]} receiveShadow>
        <meshPhysicalMaterial color="#f9fafc" roughness={0.55} clearcoat={0.3} />
      </RoundedBox>
      {/* Base un poco más oscura: le da peso a la isla */}
      <RoundedBox args={[ancho - 0.3, 0.3, fondo - 0.3]} radius={0.14} smoothness={4} position={[0, -0.55, 0]}>
        <meshStandardMaterial color="#dfe4ec" roughness={0.8} />
      </RoundedBox>
      {/* Líneas de luz en los bordes de adelante y atrás */}
      {[
        [0, fondo / 2 - 0.12, ancho - 0.6, 0.025],
        [0, -fondo / 2 + 0.12, ancho - 0.6, 0.025],
      ].map(([x, z, w, h], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, z]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color="#9fbaf5" transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
