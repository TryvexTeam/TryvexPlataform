'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import type { Group, Mesh, MeshStandardMaterial } from 'three'
import type { EstadoOficina } from '@/lib/agentes/estado-oficina'
import type { AgenteSala } from '@/lib/types/sala-agentes'

/**
 * El escritorio de un agente y el agente, al estilo de SAMS: robots redondos
 * y brillantes, con visor oscuro y ojos que se encienden, cada uno en su color.
 *
 * Miran a la cámara, con el escritorio adelante: así se les ve la cara, y lo
 * que hacen lo cuenta el panel holográfico que flota sobre ellos (HTML, en
 * oficina-agentes.tsx), no una pantalla de espaldas.
 */

const BLANCO = '#fbfcfe'
const GRIS = '#c9ced8'
const PIEL_ROBOT = '#f4f6fa'
const VISOR = '#0d1320'
const OJOS = '#8fe9ff'

/** Dónde flotan el nombre y el panel, en coordenadas del puesto. */
export function alturaNombre(estado: EstadoOficina): number {
  return estado === 'esperando_permiso' ? 3.3 : 2.85
}
export const ALTURA_HOLO = 3.35
/** Los robots van un poco más grandes que el mobiliario: son los protagonistas. */
const ESCALA_ROBOT = 1.45
/** El agente de pie se para a este lado del escritorio. */
export const LADO_DE_PIE = 1.5

interface PuestoProps {
  agente: AgenteSala
  posicion: [number, number]
  seleccionado: boolean
  alSeleccionar: (id: string) => void
  animar: boolean
}

export function Puesto({ agente, posicion, seleccionado, alSeleccionar, animar }: PuestoProps) {
  const estado = agente.oficina.estado
  const presente = estado !== 'ausente'
  const dePie = estado === 'esperando_permiso'
  const color = agente.colorHex

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

      {/* Escritorio, adelante del agente */}
      <RoundedBox args={[2.1, 0.07, 0.95]} radius={0.03} position={[0, 0.76, 0.3]} castShadow receiveShadow>
        <meshStandardMaterial color={BLANCO} roughness={0.35} />
      </RoundedBox>
      {[
        [-0.95, -0.06],
        [0.95, -0.06],
        [-0.95, 0.66],
        [0.95, 0.66],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.37, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.74, 10]} />
          <meshStandardMaterial color={GRIS} metalness={0.3} roughness={0.4} />
        </mesh>
      ))}

      <Monitor estado={estado} color={color} animar={animar} />

      <mesh position={[0, 0.81, 0.12]} castShadow>
        <boxGeometry args={[0.6, 0.022, 0.18]} />
        <meshStandardMaterial color="#e6e9ef" />
      </mesh>

      {estado === 'descansando' && <Taza animar={animar} />}

      <Silla ocupada={presente && !dePie} color={color} />

      {presente && (
        <group position={dePie ? [LADO_DE_PIE, 0, 0.05] : [0, 0.48, -0.5]} rotation={[0, dePie ? -0.35 : 0, 0]} scale={ESCALA_ROBOT}>
          <Robot estado={estado} color={color} animar={animar} dePie={dePie} />
        </group>
      )}
    </group>
  )
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
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
      <ringGeometry args={[1.4, 1.5, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  )
}

/**
 * Un portátil bajo, y no un monitor: con la cámara mirando desde arriba, un
 * monitor alto tapaba la cara del agente. El brillo de la tapa cuenta el estado.
 */
function Monitor({ estado, color, animar }: { estado: EstadoOficina; color: string; animar: boolean }) {
  const luz = useRef<MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (!luz.current || !animar) return
    if (estado === 'trabajando') luz.current.emissiveIntensity = 0.9 + Math.sin(clock.elapsedTime * 6) * 0.2
    if (estado === 'esperando_permiso') luz.current.emissiveIntensity = 0.4 + Math.abs(Math.sin(clock.elapsedTime * 2.4)) * 0.9
  })
  const brillo =
    estado === 'trabajando' ? color : estado === 'esperando_permiso' ? '#f3b54a' : estado === 'descansando' ? '#9db8ff' : '#000000'
  return (
    <group position={[0, 0.8, 0.42]}>
      <RoundedBox args={[0.72, 0.03, 0.46]} radius={0.012} position={[0, 0.015, 0]} castShadow>
        <meshStandardMaterial color="#e9ecf2" roughness={0.3} />
      </RoundedBox>
      {/* La tapa, inclinada hacia el agente, con el logo que brilla hacia la cámara */}
      <group position={[0, 0.03, 0.22]} rotation={[-0.35, 0, 0]}>
        <RoundedBox args={[0.72, 0.46, 0.025]} radius={0.012} position={[0, 0.23, 0]} castShadow>
          <meshStandardMaterial color="#e9ecf2" roughness={0.3} />
        </RoundedBox>
        <mesh position={[0, 0.24, 0.014]}>
          <circleGeometry args={[0.07, 24]} />
          <meshStandardMaterial
            ref={luz}
            color="#ffffff"
            emissive={brillo}
            emissiveIntensity={estado === 'ausente' ? 0 : 0.9}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

function Silla({ ocupada, color }: { ocupada: boolean; color: string }) {
  // Vacía, queda corrida y girada, como la deja alguien que se fue.
  return (
    <group position={[ocupada ? 0 : -0.4, 0, ocupada ? -0.55 : -0.95]} rotation={[0, ocupada ? 0 : -0.7, 0]}>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.48, 8]} />
        <meshStandardMaterial color={GRIS} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.03, 20]} />
        <meshStandardMaterial color={GRIS} />
      </mesh>
      <RoundedBox args={[0.62, 0.08, 0.58]} radius={0.035} position={[0, 0.5, 0]} castShadow>
        <meshStandardMaterial color="#e4e7ee" />
      </RoundedBox>
      <RoundedBox args={[0.6, 0.66, 0.08]} radius={0.04} position={[0, 0.86, -0.28]} castShadow>
        <meshStandardMaterial color="#e4e7ee" />
      </RoundedBox>
      <mesh position={[0, 0.86, -0.325]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.46, 0.07]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
      </mesh>
    </group>
  )
}

/**
 * El robot. Sentado tecleando, reclinado con su café, o de pie con el cartel
 * cuando espera que alguien apruebe su encargo. Parpadea.
 */
function Robot({ estado, color, animar, dePie }: { estado: EstadoOficina; color: string; animar: boolean; dePie: boolean }) {
  const cuerpo = useRef<Group>(null)
  const cabeza = useRef<Group>(null)
  const ojos = useRef<Group>(null)
  const brazoI = useRef<Mesh>(null)
  const brazoD = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    if (!animar) return
    const t = clock.elapsedTime
    // Parpadeo: un cierre corto cada ~3,5 s. Descansando, los ojos a media asta.
    if (ojos.current) {
      const abierto = estado === 'descansando' ? 0.45 : 1
      ojos.current.scale.y = t % 3.5 < 0.12 ? 0.1 : abierto
    }
    if (estado === 'trabajando') {
      if (brazoI.current) brazoI.current.position.z = 0.26 + Math.sin(t * 14) * 0.025
      if (brazoD.current) brazoD.current.position.z = 0.26 + Math.sin(t * 14 + 1.7) * 0.025
      if (cabeza.current) cabeza.current.rotation.x = 0.18 + Math.sin(t * 1.3) * 0.04
    } else if (estado === 'descansando' && cuerpo.current) {
      cuerpo.current.scale.y = 1 + Math.sin(t * 1.4) * 0.015
    } else if (dePie && cuerpo.current) {
      cuerpo.current.position.y = Math.abs(Math.sin(t * 2.6)) * 0.06
    }
  })

  const cuerpoMat = <meshPhysicalMaterial color={color} roughness={0.28} clearcoat={1} clearcoatRoughness={0.15} />
  const alturaCuerpo = dePie ? 0.78 : 0.3

  return (
    <group ref={cuerpo} rotation={[estado === 'descansando' ? -0.2 : 0, 0, 0]}>
      {dePie && (
        <>
          <mesh position={[-0.11, 0.25, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.3, 6, 12]} />
            {cuerpoMat}
          </mesh>
          <mesh position={[0.11, 0.25, 0]} castShadow>
            <capsuleGeometry args={[0.08, 0.3, 6, 12]} />
            {cuerpoMat}
          </mesh>
        </>
      )}
      <mesh position={[0, alturaCuerpo, 0]} castShadow>
        <capsuleGeometry args={[0.27, 0.24, 8, 20]} />
        {cuerpoMat}
      </mesh>

      <group ref={cabeza} position={[0, alturaCuerpo + 0.58, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.36, 32, 32]} />
          <meshPhysicalMaterial color={PIEL_ROBOT} roughness={0.2} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
        {/* Visor oscuro, mirando a la cámara. El radio de las esquinas tiene
            que ser menor que la mitad del grosor, o Three.js lo dibuja roto. */}
        <RoundedBox args={[0.54, 0.3, 0.12]} radius={0.055} smoothness={6} position={[0, 0.0, 0.29]}>
          <meshPhysicalMaterial color={VISOR} roughness={0.1} clearcoat={1} />
        </RoundedBox>
        <group ref={ojos} position={[0, 0.01, 0.355]}>
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.08, 0.1, 0.01]} />
              <meshStandardMaterial color={OJOS} emissive={OJOS} emissiveIntensity={0.9} />
            </mesh>
          ))}
        </group>
        {/* Antena con la luz del color del agente */}
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.14, 8]} />
          <meshStandardMaterial color={GRIS} />
        </mesh>
        <mesh position={[0, 0.51, 0]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
      </group>

      {!dePie && (
        <>
          <mesh ref={brazoI} position={[-0.3, alturaCuerpo - 0.02, 0.26]} rotation={[Math.PI / 2.3, 0, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.24, 6, 12]} />
            {cuerpoMat}
          </mesh>
          <mesh ref={brazoD} position={[0.3, alturaCuerpo - 0.02, 0.26]} rotation={[Math.PI / 2.3, 0, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.24, 6, 12]} />
            {cuerpoMat}
          </mesh>
        </>
      )}

      {dePie && (
        // El cartel: lo único de la oficina que pide la mano de una persona.
        <group position={[0.38, 0.95, 0.05]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.016, 0.016, 0.8, 8]} />
            <meshStandardMaterial color={GRIS} />
          </mesh>
          <RoundedBox args={[0.52, 0.36, 0.03]} radius={0.04} position={[0, 0.72, 0]} castShadow>
            <meshStandardMaterial color="#f3b54a" emissive="#f3b54a" emissiveIntensity={0.35} />
          </RoundedBox>
          <mesh position={[0, 0.75, 0.018]}>
            <planeGeometry args={[0.05, 0.17]} />
            <meshBasicMaterial color="#3a2606" />
          </mesh>
          <mesh position={[0, 0.63, 0.018]}>
            <planeGeometry args={[0.05, 0.05]} />
            <meshBasicMaterial color="#3a2606" />
          </mesh>
        </group>
      )}
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
      const m = (v as Mesh).material as MeshStandardMaterial
      m.opacity = 0.5 * (1 - fase)
    })
  })
  return (
    <group position={[0.72, 0.8, 0.25]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.14, 16]} />
        <meshStandardMaterial color={BLANCO} />
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
