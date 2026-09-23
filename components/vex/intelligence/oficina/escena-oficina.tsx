'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CameraControls, ContactShadows, RoundedBox } from '@react-three/drei'
import { Vector3 } from 'three'
import { distribuirConZonas, type ZonaOficina } from '@/lib/agentes/distribucion-oficina'
import type { AgenteSala } from '@/lib/types/sala-agentes'
import { ALTURA_HOLO, LADO_DE_PIE, Puesto, alturaNombre } from './robot'
import { ZonaCola, ZonaConocimiento, ZonaDirectivas, ZonaWhatsapp } from './zonas-3d'

/**
 * La oficina en 3D, en el estilo de estudio claro de SAMS.
 *
 * Todo está hecho con formas simples, sin modelos ni fuentes descargadas: carga
 * rápido y no depende de terceros. Los textos (nombres, paneles holográficos,
 * carteles de las zonas) son HTML encima del lienzo: la escena solo los mueve
 * a su lugar en cada cuadro (ver Proyector), sin crear nada.
 *
 * Se carga solo en el navegador y solo en esta vista (next/dynamic), así el
 * peso de Three.js no lo paga el resto del CRM.
 */

const FONDO = '#eef1f6'

export interface EscenaProps {
  agentes: AgenteSala[]
  seleccionado: string | null
  alSeleccionar: (id: string) => void
  /** false con "reducir movimiento" o fuera de pantalla: la escena no se anima. */
  animar: boolean
  /** Elementos HTML por clave: `n:<id>` nombre, `h:<id>` panel, `z:<zona>` cartel. */
  anclas: React.RefObject<Map<string, HTMLElement>>
  /** Cuánto hay en cada zona (encargos esperando, documentos, sin leer, directivas). */
  zonas: Record<ZonaOficina, number>
  /** Cambia cada vez que se pide volver a ver la sala completa. */
  verSala: number
}

export default function EscenaOficina({ agentes, seleccionado, alSeleccionar, animar, anclas, zonas, verSala }: EscenaProps) {
  const dist = useMemo(() => distribuirConZonas(agentes.length), [agentes.length])
  const [ancho, fondo] = dist.sala

  // Dónde flota cada elemento HTML, en coordenadas de la escena.
  const posiciones = useMemo(() => {
    const m = new Map<string, [number, number, number]>()
    agentes.forEach((a, i) => {
      const [x, z] = dist.puestos[i]
      const dePie = a.oficina.estado === 'esperando_permiso'
      m.set(`n:${a.id}`, [x + (dePie ? LADO_DE_PIE : 0), alturaNombre(a.oficina.estado), z + (dePie ? 0.05 : -0.5)])
      m.set(`h:${a.id}`, [x, ALTURA_HOLO, z - 0.3])
    })
    for (const [zona, [x, z]] of Object.entries(dist.zonas)) m.set(`z:${zona}`, [x, 0.05, z + 1.25])
    return m
  }, [agentes, dist])

  const camara = useMemo(() => {
    const d = Math.max(ancho * 0.66, fondo * 0.82) + 2
    return { pos: [d * 0.38, d * 0.6, d * 0.8] as [number, number, number], d }
  }, [ancho, fondo])

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.75]}
      frameloop={animar ? 'always' : 'demand'}
      camera={{ position: camara.pos, fov: 32 }}
      gl={{ antialias: true, powerPreference: 'low-power' }}
    >
      <color attach="background" args={[FONDO]} />
      <fog attach="fog" args={[FONDO, camara.d * 1.6, camara.d * 3]} />

      <hemisphereLight args={['#ffffff', '#dde3ec', 1.5]} />
      <directionalLight
        castShadow
        position={[ancho * 0.35, 14, fondo * 0.45]}
        intensity={1.9}
        color="#fff6ec"
        shadow-mapSize={[1536, 1536]}
        shadow-bias={-0.0004}
        shadow-camera-left={-ancho}
        shadow-camera-right={ancho}
        shadow-camera-top={fondo}
        shadow-camera-bottom={-fondo}
      />
      <directionalLight position={[-ancho, 6, -fondo]} intensity={0.5} color="#dbe7ff" />

      <Sala ancho={ancho} fondo={fondo} />

      {agentes.map((a, i) => (
        <Puesto
          key={a.id}
          agente={a}
          posicion={dist.puestos[i]}
          seleccionado={seleccionado === a.id}
          alSeleccionar={alSeleccionar}
          animar={animar}
        />
      ))}

      <ZonaCola posicion={dist.zonas.cola} cantidad={zonas.cola} animar={animar} />
      <ZonaConocimiento posicion={dist.zonas.conocimiento} cantidad={zonas.conocimiento} animar={animar} />
      <ZonaWhatsapp posicion={dist.zonas.whatsapp} cantidad={zonas.whatsapp} animar={animar} />
      <ZonaDirectivas posicion={dist.zonas.directivas} cantidad={zonas.directivas} animar={animar} />

      <ContactShadows position={[0, 0.004, 0]} scale={Math.max(ancho, fondo) * 1.3} opacity={0.35} blur={2.6} far={3} />

      <Camara
        agentes={agentes}
        puestos={dist.puestos}
        seleccionado={seleccionado}
        verSala={verSala}
        inicio={camara.pos}
        distanciaMax={camara.d * 1.6}
      />
      <Proyector posiciones={posiciones} anclas={anclas} />
    </Canvas>
  )
}

/**
 * La cámara: se puede girar y acercar con el dedo o el mouse, y vuela sola
 * hasta el agente que se elige (como el "Spotlight" de SAMS) o de vuelta a la
 * sala completa.
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
  inicio: [number, number, number]
  distanciaMax: number
}) {
  const controles = useRef<CameraControls>(null)
  const { size } = useThree()
  // En una pantalla angosta (celular) la sala no cabe de ancho: la cámara se
  // aleja en proporción. Se redondea para no re-encuadrar por cada pixel.
  const lejania = Math.round(Math.max(1, 1.45 / (size.width / Math.max(size.height, 1))) * 10) / 10

  useEffect(() => {
    const c = controles.current
    if (!c) return
    const i = seleccionado ? agentes.findIndex((a) => a.id === seleccionado) : -1
    if (i >= 0) {
      const [x, z] = puestos[i]
      // Encuadre para ver al agente y su panel holográfico juntos.
      const f = Math.min(lejania, 1.6)
      void c.setLookAt(x + 2.8 * f, 2.25 + 2.15 * f, z + 6.8 * f, x, 2.25, z - 0.3, true)
    } else {
      void c.setLookAt(inicio[0] * lejania, inicio[1] * lejania, inicio[2] * lejania, 0, 0.4, 0, true)
    }
    // `agentes` cambia en cada refresco: la cámara solo se mueve cuando cambia
    // lo elegido, se pide ver la sala o cambia la forma de la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado, verSala, lejania])

  return (
    <CameraControls
      ref={controles}
      makeDefault
      minPolarAngle={0.35}
      maxPolarAngle={1.25}
      minDistance={3.5}
      maxDistance={distanciaMax * lejania}
      smoothTime={0.45}
      truckSpeed={0}
    />
  )
}

/**
 * Ubica cada elemento HTML sobre su lugar de la escena, en cada cuadro. No
 * crea nada: solo mueve elementos que ya existen (los <Html> de drei montaban
 * una raíz de React por etiqueta y chocaban con React 19).
 */
function Proyector({
  posiciones,
  anclas,
}: {
  posiciones: Map<string, [number, number, number]>
  anclas: React.RefObject<Map<string, HTMLElement>>
}) {
  const { camera, size } = useThree()
  const v = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const mapa = anclas.current
    if (!mapa) return
    for (const [clave, el] of mapa) {
      const p = posiciones.get(clave)
      if (!p) {
        ubicar(el, 0, 0, false)
        continue
      }
      v.set(p[0], p[1], p[2]).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      const fuera = v.z > 1 || x < -200 || x > size.width + 200 || y < -200 || y > size.height + 200
      // Ningún cartel se sale del marco: en pantallas angostas quedaba cortado.
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

/** Una plataforma blanca de estudio, con un borde suave, y dos muros bajos. */
function Sala({ ancho, fondo }: { ancho: number; fondo: number }) {
  return (
    <group>
      <RoundedBox args={[ancho, 0.3, fondo]} radius={0.12} position={[0, -0.15, 0]} receiveShadow>
        <meshStandardMaterial color="#f7f8fb" roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0.9, -fondo / 2 + 0.06]} receiveShadow>
        <boxGeometry args={[ancho, 1.8, 0.12]} />
        <meshStandardMaterial color="#e8ebf1" />
      </mesh>
      <mesh position={[-ancho / 2 + 0.06, 0.9, 0]} receiveShadow>
        <boxGeometry args={[0.12, 1.8, fondo]} />
        <meshStandardMaterial color="#e3e7ee" />
      </mesh>
      {/* Una franja de luz en el muro: el detalle que hace de "estudio" */}
      <mesh position={[0, 1.55, -fondo / 2 + 0.13]}>
        <planeGeometry args={[ancho * 0.8, 0.05]} />
        <meshStandardMaterial color="#ffffff" emissive="#bcd4ff" emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
    </group>
  )
}
