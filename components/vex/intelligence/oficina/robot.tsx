'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { ASIENTO, rutaAPantalla } from '@/lib/agentes/distribucion-oficina'
import type { EstadoOficina } from '@/lib/agentes/estado-oficina'
import { DEFINICION_TRAJE, tonoDe, type TrajeAgente } from '@/lib/agentes/estilo-agente'
import { pielDe } from './pieles'
import type { AgenteSala } from '@/lib/types/sala-agentes'

/**
 * El escritorio de un agente y el agente.
 *
 * El robot sigue la referencia de juguete de vinilo (ver Robot, más abajo).
 * Mira a la cámara con el escritorio adelante.
 *
 * Cuando se le encola o le cambia un encargo, se levanta, va por el pasillo
 * hasta la pantalla de la Cola, la mira unos segundos y vuelve. El movimiento
 * vive en refs y en useFrame: caminar no vuelve a renderizar React.
 */

const BLANCO = '#fbfcfe'
const GRIS = '#c9ced8'
const VISOR = '#0c111c'
const OJOS = '#7fe6ff'
export const ESCALA_ROBOT = 1.6
/** Altura de la cadera, sentado (sobre la silla) y de pie (sobre sus piernas). */
const CADERA_SENTADO = 0.56
const CADERA_DE_PIE = 0.4 * ESCALA_ROBOT
const VELOCIDAD = 1.45
const SEGUNDOS_MIRANDO = 4.5
/** Dónde espera de pie, con el cartel, el que necesita un permiso. */
export const LADO_DE_PIE = 1.45

export const ALTURA_HOLO = 3.75
/** Sobre la cabeza, para el cartel con el nombre. */
const SOBRE_CABEZA = 1.42 * ESCALA_ROBOT

type Fase = 'en_casa' | 'levantando' | 'ida' | 'mirando' | 'vuelta' | 'sentando'

interface Pose {
  fase: Fase
  /** true mientras camina (piernas y brazos alternados). */
  caminando: boolean
  /** true si está de pie (en la pantalla, caminando o esperando permiso). */
  dePie: boolean
}

interface PuestoProps {
  agente: AgenteSala
  posicion: [number, number]
  seleccionado: boolean
  alSeleccionar: (id: string) => void
  animar: boolean
  /** Sube cada vez que el agente tiene que ir a mirar la pantalla. */
  visita: number
  /** Su lugar frente a la pantalla, en coordenadas de la sala. */
  frenteAPantalla: [number, number]
  /** Dónde está cada cosa que se mueve, para que los carteles HTML la sigan. */
  posiciones: React.RefObject<Map<string, [number, number, number]>>
}

/** Anota dónde está algo (fuera del componente: no es estado de React). */
function anotar(mapa: Map<string, [number, number, number]> | null, clave: string, x: number, y: number, z: number) {
  mapa?.set(clave, [x, y, z])
}

function angulo(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

/** Lleva un ángulo hacia otro por el camino más corto. */
function girar(actual: number, meta: number, paso: number): number {
  let d = meta - actual
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return actual + Math.max(-paso, Math.min(paso, d))
}

export function Puesto({ agente, posicion, seleccionado, alSeleccionar, animar, visita, frenteAPantalla, posiciones }: PuestoProps) {
  const estado = agente.oficina.estado
  const presente = estado !== 'ausente'
  const esperando = estado === 'esperando_permiso'
  const color = agente.colorHex

  // Dónde "vive" el robot, en coordenadas del escritorio.
  const casa = useMemo<[number, number]>(() => (esperando ? [LADO_DE_PIE, 0.05] : [ASIENTO[0], ASIENTO[1]]), [esperando])

  const raiz = useRef<Group>(null)
  const pose = useRef<Pose>({ fase: 'en_casa', caminando: false, dePie: esperando })
  const mov = useRef({ x: casa[0], z: casa[1], y: esperando ? CADERA_DE_PIE : CADERA_SENTADO, rot: 0, ruta: [] as Array<[number, number]>, i: 0, reloj: 0 })

  // Si cambia el estado (se sienta a trabajar, pasa a esperar permiso), vuelve
  // a su lugar sin animación: el estado manda sobre el paseo.
  useEffect(() => {
    const m = mov.current
    m.x = casa[0]
    m.z = casa[1]
    m.y = esperando ? CADERA_DE_PIE : CADERA_SENTADO
    m.rot = 0
    pose.current = { fase: 'en_casa', caminando: false, dePie: esperando }
  }, [casa, esperando])

  // Una visita nueva: se levanta y va a la pantalla por el pasillo.
  useEffect(() => {
    if (!visita || !presente || !animar) return
    if (pose.current.fase !== 'en_casa') return
    const [px, pz] = posicion
    const mundo = rutaAPantalla(posicion, frenteAPantalla)
    // La ruta en coordenadas del escritorio, saliendo desde donde está ahora.
    const ruta = mundo.map(([x, z]) => [x - px, z - pz] as [number, number])
    ruta[0] = [mov.current.x, mov.current.z]
    mov.current.ruta = ruta
    mov.current.i = 1
    mov.current.reloj = 0
    pose.current = { fase: esperando ? 'ida' : 'levantando', caminando: esperando, dePie: true }
    // Solo reacciona a una visita nueva, no a cada cambio de lo demás.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita])

  useFrame((_, dt) => {
    const r = raiz.current
    if (!r) return
    const m = mov.current
    const p = pose.current
    const paso = Math.min(dt, 0.05)

    if (p.fase === 'levantando') {
      m.y = Math.min(CADERA_DE_PIE, m.y + paso * 1.6)
      if (m.y >= CADERA_DE_PIE) Object.assign(p, { fase: 'ida', caminando: true })
    } else if (p.fase === 'ida' || p.fase === 'vuelta') {
      const [tx, tz] = m.ruta[m.i]
      const dx = tx - m.x
      const dz = tz - m.z
      const d = Math.hypot(dx, dz)
      if (d < 0.04) {
        m.i += 1
        if (m.i >= m.ruta.length) {
          if (p.fase === 'ida') Object.assign(p, { fase: 'mirando', caminando: false })
          else Object.assign(p, { fase: esperando ? 'en_casa' : 'sentando', caminando: false, dePie: esperando })
          m.reloj = 0
        }
      } else {
        const avance = Math.min(d, VELOCIDAD * paso)
        m.x += (dx / d) * avance
        m.z += (dz / d) * avance
        m.rot = girar(m.rot, angulo(dx, dz), paso * 8)
      }
    } else if (p.fase === 'mirando') {
      m.rot = girar(m.rot, Math.PI, paso * 6) // de frente a la pantalla
      m.reloj += paso
      if (m.reloj > SEGUNDOS_MIRANDO) {
        m.ruta = [...m.ruta].reverse()
        m.ruta[m.ruta.length - 1] = [casa[0], casa[1]]
        m.i = 1
        Object.assign(p, { fase: 'vuelta', caminando: true })
      }
    } else if (p.fase === 'sentando') {
      m.rot = girar(m.rot, 0, paso * 8)
      m.y = Math.max(CADERA_SENTADO, m.y - paso * 1.6)
      if (m.y <= CADERA_SENTADO && Math.abs(m.rot) < 0.02) Object.assign(p, { fase: 'en_casa', dePie: false })
    } else if (p.fase === 'en_casa') {
      m.rot = girar(m.rot, esperando ? -0.35 : 0, paso * 6)
    }

    const bamboleo = p.caminando && animar ? Math.abs(Math.sin(performanceAhora() * 9)) * 0.05 : 0
    r.position.set(m.x, m.y + bamboleo, m.z)
    r.rotation.y = m.rot
    anotar(posiciones.current, `n:${agente.id}`, posicion[0] + m.x, m.y + SOBRE_CABEZA, posicion[1] + m.z)
  })

  return (
    <group
      position={[posicion[0], 0, posicion[1]]}
      onClick={(e) => {
        e.stopPropagation()
        alSeleccionar(agente.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = ''
      }}
    >
      <Anillo visible={seleccionado} color={color} animar={animar} />
      <Alfombra color={color} />
      <Escritorio estado={estado} color={color} animar={animar} />
      {estado === 'descansando' && <Taza animar={animar} />}
      <Silla color={color} ocupada={presente && !esperando} />

      {presente && (
        <group ref={raiz} scale={ESCALA_ROBOT}>
          <Robot estado={estado} color={color} animar={animar} pose={pose} traje={agente.estilo.traje} />
        </group>
      )}
    </group>
  )
}

/** Reloj para el bamboleo, fuera del componente (no es estado de React). */
function performanceAhora(): number {
  return performance.now() / 1000
}

function Anillo({ visible, color, animar }: { visible: boolean; color: string; animar: boolean }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current || !animar) return
    const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.03
    ref.current.scale.set(s, s, s)
  })
  if (!visible) return null
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
      <ringGeometry args={[1.45, 1.55, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  )
}

/** Una alfombra suave del color del agente: marca "este puesto es suyo". */
function Alfombra({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -0.1]} receiveShadow>
      <circleGeometry args={[1.35, 48]} />
      <meshStandardMaterial color={color} transparent opacity={0.1} />
    </mesh>
  )
}

function Escritorio({ estado, color, animar }: { estado: EstadoOficina; color: string; animar: boolean }) {
  return (
    <group>
      <RoundedBox args={[2.1, 0.08, 0.95]} radius={0.035} smoothness={4} position={[0, 0.76, 0.3]} castShadow receiveShadow>
        <meshStandardMaterial color={BLANCO} roughness={0.35} />
      </RoundedBox>
      {/* El canto, del color del agente */}
      <mesh position={[0, 0.76, 0.776]}>
        <boxGeometry args={[2.0, 0.03, 0.005]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      {[-0.92, 0.92].map((x) => (
        <group key={x}>
          <RoundedBox args={[0.06, 0.72, 0.8]} radius={0.025} position={[x, 0.37, 0.3]} castShadow>
            <meshStandardMaterial color="#e4e8ef" roughness={0.4} />
          </RoundedBox>
        </group>
      ))}
      <Portatil estado={estado} color={color} animar={animar} />
      <mesh position={[0, 0.815, 0.12]} castShadow>
        <boxGeometry args={[0.56, 0.02, 0.17]} />
        <meshStandardMaterial color="#e3e7ee" />
      </mesh>
      <Planta />
    </group>
  )
}

/** Un portátil bajo: no tapa la cara del agente. El logo de la tapa cuenta el estado. */
function Portatil({ estado, color, animar }: { estado: EstadoOficina; color: string; animar: boolean }) {
  const luz = useRef<MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (!luz.current || !animar) return
    if (estado === 'trabajando') luz.current.emissiveIntensity = 1 + Math.sin(clock.elapsedTime * 6) * 0.25
    if (estado === 'esperando_permiso') luz.current.emissiveIntensity = 0.4 + Math.abs(Math.sin(clock.elapsedTime * 2.4)) * 1
  })
  const brillo =
    estado === 'trabajando' ? color : estado === 'esperando_permiso' ? '#f3b54a' : estado === 'descansando' ? '#9db8ff' : '#000000'
  return (
    <group position={[0.1, 0.8, 0.45]}>
      <RoundedBox args={[0.7, 0.025, 0.46]} radius={0.01} position={[0, 0.013, 0]} castShadow>
        <meshPhysicalMaterial color="#e6e9ef" metalness={0.3} roughness={0.25} />
      </RoundedBox>
      <group position={[0, 0.025, 0.22]} rotation={[-0.32, 0, 0]}>
        <RoundedBox args={[0.7, 0.46, 0.022]} radius={0.01} position={[0, 0.23, 0]} castShadow>
          <meshPhysicalMaterial color="#e6e9ef" metalness={0.3} roughness={0.25} />
        </RoundedBox>
        <mesh position={[0, 0.24, 0.013]}>
          <circleGeometry args={[0.06, 24]} />
          <meshStandardMaterial ref={luz} color="#ffffff" emissive={brillo} emissiveIntensity={estado === 'ausente' ? 0 : 1} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

function Planta() {
  return (
    <group position={[-0.78, 0.8, 0.52]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.065, 0.14, 18]} />
        <meshStandardMaterial color="#f0e6da" />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow>
        <icosahedronGeometry args={[0.12, 1]} />
        <meshStandardMaterial color="#5fae7e" flatShading roughness={0.8} />
      </mesh>
    </group>
  )
}

function Silla({ ocupada, color }: { ocupada: boolean; color: string }) {
  return (
    <group position={[ASIENTO[0], 0, ASIENTO[1] - (ocupada ? 0 : 0.35)]} rotation={[0, ocupada ? 0 : -0.5, 0]}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.5, 10]} />
        <meshStandardMaterial color={GRIS} metalness={0.4} roughness={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} position={[Math.sin((k / 5) * Math.PI * 2) * 0.22, 0.03, Math.cos((k / 5) * Math.PI * 2) * 0.22]} castShadow>
          <sphereGeometry args={[0.035, 10, 10]} />
          <meshStandardMaterial color="#9aa3b2" />
        </mesh>
      ))}
      <RoundedBox args={[0.62, 0.09, 0.58]} radius={0.04} smoothness={4} position={[0, 0.51, 0]} castShadow>
        <meshStandardMaterial color="#eef0f4" roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[0.6, 0.62, 0.09]} radius={0.04} smoothness={4} position={[0, 0.86, -0.28]} castShadow>
        <meshStandardMaterial color="#eef0f4" roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.86, -0.33]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.44, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

/**
 * El robot, siguiendo la referencia (juguete de vinilo):
 *   · cabeza grande y redonda, del color del cuerpo;
 *   · el visor es una PANTALLA AL RAS de la cabeza: un trozo de la misma
 *     esfera, apenas más grande, en negro brillante. No una burbuja pegada
 *     encima (esa primera versión parecía una máscara);
 *   · ojos en arco (∩ ∩), gruesos y grandes: se tienen que leer de lejos;
 *   · vinilo satinado, no plástico duro;
 *   · cuerpo de poroto, brazos gruesos con manos redondas, piernas cortas
 *     con botas redondas; orejas de disco.
 * El traje va PINTADO en el cuerpo (pieles.ts), no como piezas 3D encima; cada
 * traje define también los colores de cabeza, brazos, manos y piernas.
 *
 * El origen está en la cadera: sentado, las piernas van hacia adelante; de
 * pie, cuelgan; caminando, se alternan con los brazos.
 */

const R_CABEZA = 0.4
/** Ancho y alto del visor, en radianes sobre la esfera de la cabeza. */
const VISOR_ANCHO = 1.72
const VISOR_ALTO = 1.02
/** El visor queda un poco bajo el ecuador, como en la referencia. */
const VISOR_CENTRO = Math.PI / 2 + 0.1

function Robot({
  estado,
  color,
  animar,
  pose,
  traje,
}: {
  estado: EstadoOficina
  color: string
  animar: boolean
  pose: React.RefObject<Pose>
  traje: TrajeAgente
}) {
  const def = DEFINICION_TRAJE[traje]
  const mayordomo = traje === 'esmoquin'
  const piel = useMemo(() => pielDe(traje, color), [traje, color])
  const torso = useRef<Group>(null)
  const cabeza = useRef<Group>(null)
  const ojos = useRef<Group>(null)
  const piernaI = useRef<Group>(null)
  const piernaD = useRef<Group>(null)
  const brazoI = useRef<Group>(null)
  const brazoD = useRef<Group>(null)
  const cartel = useRef<Group>(null)

  const tonos = useMemo(() => {
    const base = new Color(color)
    return {
      oscuro: `#${base.clone().multiplyScalar(0.78).getHexString()}`,
      claro: `#${base.clone().lerp(new Color('#ffffff'), 0.35).getHexString()}`,
    }
  }, [color])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const p = pose.current
    if (!p) return
    const sentado = !p.dePie
    const mirando = p.fase === 'mirando'
    const oscilar = (vel: number, fase = 0) => (animar ? Math.sin(t * vel + fase) : 0)

    // Parpadeo cada ~3,5 s; descansando, los arcos más bajos (ojos tranquilos).
    if (ojos.current) {
      const abierto = estado === 'descansando' && sentado ? 0.6 : 1
      ojos.current.scale.y = animar && t % 3.5 < 0.12 ? 0.15 : abierto
    }

    if (piernaI.current && piernaD.current) {
      if (sentado) {
        piernaI.current.rotation.x = piernaD.current.rotation.x = -Math.PI / 2
      } else if (p.caminando) {
        piernaI.current.rotation.x = oscilar(9) * 0.6
        piernaD.current.rotation.x = -oscilar(9) * 0.6
      } else {
        piernaI.current.rotation.x = piernaD.current.rotation.x = 0
      }
    }

    if (brazoI.current && brazoD.current) {
      if (p.caminando) {
        brazoI.current.rotation.x = -oscilar(9) * 0.55
        brazoD.current.rotation.x = oscilar(9) * 0.55
      } else if (sentado && estado === 'trabajando') {
        brazoI.current.rotation.x = -1.15 + oscilar(14) * 0.12
        brazoD.current.rotation.x = -1.15 + oscilar(14, 1.7) * 0.12
      } else if (!sentado && estado === 'esperando_permiso' && !mirando) {
        brazoI.current.rotation.x = 0
        brazoD.current.rotation.x = -2.6 // levanta el cartel
      } else if (sentado) {
        brazoI.current.rotation.x = brazoD.current.rotation.x = -0.55
      } else if (mayordomo) {
        brazoI.current.rotation.x = brazoD.current.rotation.x = -0.5 // manos juntas, de mayordomo
      } else {
        brazoI.current.rotation.x = brazoD.current.rotation.x = oscilar(1.5) * 0.04
      }
    }

    if (cartel.current) cartel.current.visible = estado === 'esperando_permiso' && !p.caminando && !mirando

    if (torso.current) {
      torso.current.rotation.x = sentado && estado === 'descansando' ? -0.16 : 0
      torso.current.scale.y = 1 + (sentado && estado === 'descansando' ? oscilar(1.4) * 0.015 : 0)
    }
    if (cabeza.current) {
      if (mirando) cabeza.current.rotation.x = -0.24 + oscilar(1.2) * 0.04
      else if (sentado && estado === 'trabajando') cabeza.current.rotation.x = 0.12 + oscilar(1.3) * 0.04
      else cabeza.current.rotation.x = oscilar(0.8) * 0.03
      cabeza.current.rotation.y = mirando ? oscilar(0.9) * 0.18 : 0
      cabeza.current.rotation.z = !sentado && !p.caminando && !mirando ? oscilar(0.7) * 0.05 : 0
    }
  })

  // Vinilo satinado: brillo suave y ancho, no espejo.
  const vinilo = (c: string) => (
    // Sin "sheen": era lo más caro por píxel y casi no se notaba.
    <meshPhysicalMaterial color={c} roughness={0.46} clearcoat={0.35} clearcoatRoughness={0.4} />
  )
  const colorCabeza = tonoDe(def.cabeza, color)
  const colorBrazos = tonoDe(def.brazos, color)
  const colorManos = tonoDe(def.manos, color)
  const colorPiernas = tonoDe(def.piernas, color)
  const colorPies = def.pies === 'oscuro' ? tonos.oscuro : tonoDe(def.pies, color)
  const cabezaPropia = def.cabeza !== 'color'

  return (
    <group>
      {/* Piernas cortas y gruesas, con pivote en la cadera */}
      {[
        [piernaI, -0.13],
        [piernaD, 0.13],
      ].map(([ref, x]) => (
        <group key={String(x)} ref={ref as React.RefObject<Group>} position={[x as number, 0, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow>
            <capsuleGeometry args={[0.105, 0.1, 8, 18]} />
            {vinilo(colorPiernas)}
          </mesh>
          <mesh position={[0, -0.3, 0.045]} scale={[1, 0.68, 1.3]} castShadow>
            <sphereGeometry args={[0.125, 24, 24]} />
            {vinilo(colorPies)}
          </mesh>
        </group>
      ))}

      <group ref={torso}>
        {/* Cuerpo de poroto, con el traje pintado */}
        <mesh position={[0, 0.22, 0]} scale={[1.02, 1.06, 0.9]} castShadow>
          <sphereGeometry args={[0.3, 48, 48]} />
          <meshPhysicalMaterial color={piel ? '#ffffff' : color} map={piel} roughness={0.46} clearcoat={0.35} clearcoatRoughness={0.4} />
        </mesh>

        {/* Brazos gruesos, con pivote en el hombro */}
        {[
          [brazoI, -0.32],
          [brazoD, 0.32],
        ].map(([ref, x]) => (
          <group
            key={String(x)}
            ref={ref as React.RefObject<Group>}
            position={[x as number, 0.34, 0]}
            rotation={[0, 0, (x as number) < 0 ? 0.2 : -0.2]}
          >
            <mesh position={[0, -0.1, 0]} castShadow>
              <capsuleGeometry args={[0.088, 0.1, 8, 16]} />
              {vinilo(colorBrazos)}
            </mesh>
            <mesh position={[0, -0.23, 0.01]} castShadow>
              <sphereGeometry args={[0.105, 24, 24]} />
              {vinilo(colorManos)}
            </mesh>
            {(x as number) > 0 && (
              // El cartel, en la mano derecha: solo cuando espera un permiso.
              <group ref={cartel} position={[0, -0.28, 0.02]} visible={false}>
                <mesh position={[0, -0.25, 0]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.5, 8]} />
                  <meshStandardMaterial color={GRIS} />
                </mesh>
                <group position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]}>
                  <RoundedBox args={[0.42, 0.28, 0.025]} radius={0.04} castShadow>
                    <meshStandardMaterial color="#f3b54a" emissive="#f3b54a" emissiveIntensity={0.3} />
                  </RoundedBox>
                  <mesh position={[0, 0.03, 0.014]}>
                    <planeGeometry args={[0.04, 0.13]} />
                    <meshBasicMaterial color="#3a2606" />
                  </mesh>
                  <mesh position={[0, -0.07, 0.014]}>
                    <planeGeometry args={[0.04, 0.04]} />
                    <meshBasicMaterial color="#3a2606" />
                  </mesh>
                </group>
              </group>
            )}
          </group>
        ))}

        {/* Cabeza grande: el personaje está en la cara */}
        <group ref={cabeza} position={[0, 0.84, 0]}>
          <group scale={[1.08, 1, 1]}>
            <mesh castShadow>
              <sphereGeometry args={[R_CABEZA, 64, 48]} />
              {vinilo(colorCabeza)}
            </mesh>
            {/* Visor al ras: un trozo de la misma esfera, en negro brillante */}
            <mesh>
              <sphereGeometry
                args={[
                  R_CABEZA * 1.006,
                  64,
                  32,
                  Math.PI / 2 - VISOR_ANCHO / 2,
                  VISOR_ANCHO,
                  VISOR_CENTRO - VISOR_ALTO / 2,
                  VISOR_ALTO,
                ]}
              />
              <meshPhysicalMaterial color={VISOR} roughness={0.14} clearcoat={1} clearcoatRoughness={0.08} />
            </mesh>
            {/* Ojos en arco, sobre el visor, mirando hacia afuera */}
            <group ref={ojos}>
              {[-0.3, 0.3].map((giro) => (
                <group key={giro} rotation={[-(Math.PI / 2 - VISOR_CENTRO) - 0.04, giro, 0]}>
                  <mesh position={[0, 0.02, R_CABEZA * 1.02]}>
                    <torusGeometry args={[0.07, 0.024, 14, 36, Math.PI]} />
                    <meshStandardMaterial color={OJOS} emissive={OJOS} emissiveIntensity={1.6} toneMapped={false} />
                  </mesh>
                </group>
              ))}
            </group>
            {/* Sonrisa chica */}
            <group rotation={[-(Math.PI / 2 - VISOR_CENTRO) + 0.2, 0, 0]}>
              <mesh position={[0, 0, R_CABEZA * 1.018]} rotation={[0, 0, Math.PI]}>
                <torusGeometry args={[0.035, 0.011, 10, 24, Math.PI]} />
                <meshStandardMaterial color={OJOS} emissive={OJOS} emissiveIntensity={1.1} toneMapped={false} />
              </mesh>
            </group>
          </group>
          {/* Orejas de disco */}
          {[-1, 1].map((l) => (
            <group key={l} position={[l * R_CABEZA * 1.06, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.12, 0.12, 0.09, 32]} />
                {vinilo(cabezaPropia ? '#e7e9ee' : tonos.oscuro)}
              </mesh>
              <mesh position={[0, l * 0.047, 0]}>
                <cylinderGeometry args={[0.075, 0.075, 0.01, 28]} />
                {vinilo(cabezaPropia ? '#ffffff' : tonos.claro)}
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

function Taza({ animar }: { animar: boolean }) {
  const vapor = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (!vapor.current || !animar) return
    vapor.current.children.forEach((v, i) => {
      const fase = (clock.elapsedTime * 0.5 + i / 3) % 1
      v.position.y = fase * 0.35
      v.scale.setScalar(0.6 + fase * 0.8)
      const mat = (v as Mesh).material as MeshStandardMaterial
      mat.opacity = 0.5 * (1 - fase)
    })
  })
  return (
    <group position={[0.72, 0.8, 0.22]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.14, 18]} />
        <meshPhysicalMaterial color={BLANCO} clearcoat={0.6} />
      </mesh>
      <group ref={vapor} position={[0, 0.17, 0]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
