'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, RoundedBox } from '@react-three/drei'
import type { Group } from 'three'
import type { ZonaOficina } from '@/lib/agentes/distribucion-oficina'

/**
 * Las cuatro zonas de la oficina, cada una con su dato real:
 *   · Cola          → la pantalla grande (pantalla-cola.tsx)
 *   · Conocimiento  → un cubo por documento del Cerebro, unidos como un grafo
 *   · WhatsApp      → una burbuja por mensaje sin leer
 *   · Directivas    → una hoja por directiva vigente
 * Se topan en un máximo para que la escena no se vuelva ruido; el número
 * exacto va en el cartel del piso (HTML, en oficina-agentes.tsx).
 */

export const COLOR_ZONA: Record<ZonaOficina, string> = {
  cola: '#f3b54a',
  conocimiento: '#7c6cf2',
  whatsapp: '#25d366',
  directivas: '#e8604c',
}

interface ZonaProps {
  posicion: [number, number]
  cantidad: number
  animar: boolean
}

/** El piso de la zona: un rectángulo suave de su color. */
function Piso({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow>
      <planeGeometry args={[3.4, 2.6]} />
      <meshStandardMaterial color={color} transparent opacity={0.12} />
    </mesh>
  )
}

export function ZonaConocimiento({ posicion, cantidad, animar }: ZonaProps) {
  const nube = useRef<Group>(null)
  const n = Math.min(cantidad, 24)
  // Posiciones fijas (no aleatorias en cada render): una espiral suave.
  const cubos = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const a = i * 2.39996
        const r = 0.35 + (i / Math.max(n, 1)) * 0.95
        return [Math.cos(a) * r, 1.1 + ((i * 0.37) % 1.1), Math.sin(a) * r * 0.7] as [number, number, number]
      }),
    [n],
  )
  const colores = ['#7c6cf2', '#2bb3a3', '#f3b54a', '#5b8def']
  useFrame(({ clock }) => {
    if (!nube.current || !animar) return
    nube.current.rotation.y = clock.elapsedTime * 0.12
    nube.current.position.y = Math.sin(clock.elapsedTime * 0.8) * 0.05
  })
  return (
    <group position={[posicion[0], 0, posicion[1]]}>
      <Piso color={COLOR_ZONA.conocimiento} />
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.8, 0.4, 32]} />
        <meshStandardMaterial color="#fbfcfe" />
      </mesh>
      <mesh position={[0, 0.41, 0]}>
        <cylinderGeometry args={[0.62, 0.62, 0.02, 32]} />
        <meshStandardMaterial color={COLOR_ZONA.conocimiento} emissive={COLOR_ZONA.conocimiento} emissiveIntensity={0.6} />
      </mesh>
      <group ref={nube}>
        {cubos.map((p, i) => (
          <RoundedBox key={i} args={[0.2, 0.2, 0.2]} radius={0.03} position={p} castShadow>
            <meshStandardMaterial color={colores[i % colores.length]} roughness={0.35} />
          </RoundedBox>
        ))}
        {cubos.slice(1).map((p, i) => (
          <Line key={i} points={[cubos[i], p]} color="#9aa3b5" lineWidth={1} transparent opacity={0.55} />
        ))}
      </group>
    </group>
  )
}

export function ZonaWhatsapp({ posicion, cantidad, animar }: ZonaProps) {
  const burbujas = useRef<Group>(null)
  const n = Math.min(cantidad, 6)
  useFrame(({ clock }) => {
    if (!burbujas.current || !animar) return
    burbujas.current.children.forEach((b, i) => {
      b.position.y = 1.9 + i * 0.28 + Math.sin(clock.elapsedTime * 1.6 + i) * 0.05
    })
  })
  return (
    <group position={[posicion[0], 0, posicion[1]]}>
      <Piso color={COLOR_ZONA.whatsapp} />
      <RoundedBox args={[0.7, 0.9, 0.5]} radius={0.06} position={[0, 0.45, 0]} castShadow>
        <meshStandardMaterial color="#fbfcfe" />
      </RoundedBox>
      {/* El teléfono */}
      <RoundedBox args={[0.5, 0.95, 0.06]} radius={0.06} position={[0, 1.4, 0.05]} rotation={[-0.15, 0, 0]} castShadow>
        <meshStandardMaterial color="#1c2230" />
      </RoundedBox>
      <mesh position={[0, 1.4, 0.09]} rotation={[-0.15, 0, 0]}>
        <planeGeometry args={[0.42, 0.84]} />
        <meshStandardMaterial color="#0b141a" emissive={COLOR_ZONA.whatsapp} emissiveIntensity={cantidad > 0 ? 0.35 : 0.08} />
      </mesh>
      <group ref={burbujas}>
        {Array.from({ length: n }, (_, i) => (
          <RoundedBox key={i} args={[0.42, 0.2, 0.05]} radius={0.08} position={[i % 2 ? 0.28 : -0.28, 1.9 + i * 0.28, 0.1]}>
            <meshStandardMaterial color={i % 2 ? '#dcf8c6' : '#ffffff'} />
          </RoundedBox>
        ))}
      </group>
    </group>
  )
}

export function ZonaDirectivas({ posicion, cantidad }: ZonaProps) {
  const hojas = Math.min(cantidad, 6)
  return (
    <group position={[posicion[0], 0, posicion[1]]}>
      <Piso color={COLOR_ZONA.directivas} />
      {/* Atril */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 1, 12]} />
        <meshStandardMaterial color="#c9ced8" />
      </mesh>
      <RoundedBox args={[0.9, 0.06, 0.65]} radius={0.02} position={[0, 1.05, 0]} rotation={[-0.35, 0, 0]} castShadow>
        <meshStandardMaterial color="#fbfcfe" />
      </RoundedBox>
      {Array.from({ length: hojas }, (_, i) => (
        <mesh key={i} position={[(i - hojas / 2) * 0.03, 1.09 + i * 0.012, 0.02 - i * 0.004]} rotation={[-0.35 - Math.PI / 2, 0, (i - hojas / 2) * 0.04]}>
          <planeGeometry args={[0.6, 0.45]} />
          <meshStandardMaterial color={i === hojas - 1 ? '#ffffff' : '#f3efe8'} side={2} />
        </mesh>
      ))}
      {hojas > 0 && (
        <mesh position={[0.34, 1.35, -0.1]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color={COLOR_ZONA.directivas} emissive={COLOR_ZONA.directivas} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}
