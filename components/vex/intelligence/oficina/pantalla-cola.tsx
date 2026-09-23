'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { CanvasTexture, SRGBColorSpace, type Mesh } from 'three'
import {
  COLUMNAS_PANTALLA,
  columnasDePantalla,
  haceCuanto,
  type EncargoPantalla,
} from '@/lib/agentes/pantalla-cola'

/**
 * La pantalla grande de la oficina: la Cola de encargos, en vivo, al fondo de
 * la sala. Es lo que los agentes van a mirar cuando se les encola algo.
 *
 * Se dibuja en un lienzo 2D y se usa como textura: texto real y nítido, dentro
 * de la escena con su perspectiva (una capa HTML no giraría con la cámara). Se
 * redibuja solo cuando cambia la Cola, y cada 30 s para los "hace X min".
 */

export const ANCHO_PANTALLA = 6.6
const ALTO_PANTALLA = ANCHO_PANTALLA * (9 / 16)
const BASE_PANTALLA = 0.95
const W = 2048
const H = 1152

interface AgenteDePantalla {
  nombre: string
  colorHex: string
}

interface PantallaProps {
  posicion: [number, number]
  encargos: EncargoPantalla[]
  agentes: Record<string, AgenteDePantalla>
  alTocar: () => void
  animar: boolean
}

export function PantallaCola({ posicion, encargos, agentes, alTocar, animar }: PantallaProps) {
  const { lienzo, textura } = useMemo(() => crearLienzo(), [])
  const punto = useRef<Mesh>(null)

  useEffect(() => {
    if (!lienzo || !textura) return
    const dibujar = () => {
      const ctx = lienzo.getContext('2d')
      if (!ctx) return
      dibujarCola(ctx, encargos, agentes, Date.now())
      marcarParaSubir(textura)
    }
    dibujar()
    const t = setInterval(dibujar, 30_000)
    return () => clearInterval(t)
  }, [lienzo, textura, encargos, agentes])

  useEffect(() => () => textura?.dispose(), [textura])

  // El punto "en vivo" late: la pantalla no es una foto.
  useFrame(({ clock }) => {
    if (!punto.current || !animar) return
    const s = 0.8 + Math.abs(Math.sin(clock.elapsedTime * 2)) * 0.4
    punto.current.scale.setScalar(s)
  })

  const y = BASE_PANTALLA + ALTO_PANTALLA / 2

  return (
    <group
      position={[posicion[0], 0, posicion[1]]}
      onClick={(e) => {
        e.stopPropagation()
        alTocar()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = ''
      }}
    >
      {/* Patas */}
      {[-ANCHO_PANTALLA * 0.32, ANCHO_PANTALLA * 0.32].map((x) => (
        <group key={x} position={[x, 0, -0.05]}>
          <mesh position={[0, BASE_PANTALLA / 2 + 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, BASE_PANTALLA + 0.2, 14]} />
            <meshStandardMaterial color="#c3c9d4" metalness={0.5} roughness={0.3} />
          </mesh>
          <RoundedBox args={[0.7, 0.05, 0.5]} radius={0.02} position={[0, 0.025, 0]} castShadow>
            <meshStandardMaterial color="#c3c9d4" metalness={0.5} roughness={0.3} />
          </RoundedBox>
        </group>
      ))}

      {/* Marco */}
      <RoundedBox args={[ANCHO_PANTALLA + 0.24, ALTO_PANTALLA + 0.24, 0.14]} radius={0.06} position={[0, y, -0.1]} castShadow>
        <meshPhysicalMaterial color="#161b27" roughness={0.35} clearcoat={0.6} />
      </RoundedBox>

      {/* La imagen, sin luz propia: una pantalla se ve igual con o sin sombra */}
      {textura && (
        <mesh position={[0, y, -0.025]}>
          <planeGeometry args={[ANCHO_PANTALLA, ALTO_PANTALLA]} />
          <meshBasicMaterial map={textura} toneMapped={false} />
        </mesh>
      )}

      {/* Halo en el piso, del color de la pantalla */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0.9]}>
        <planeGeometry args={[ANCHO_PANTALLA * 1.1, 2.2]} />
        <meshBasicMaterial color="#6c9cf5" transparent opacity={0.08} />
      </mesh>

      <mesh ref={punto} position={[ANCHO_PANTALLA / 2 - 0.25, y + ALTO_PANTALLA / 2 - 0.2, -0.01]}>
        <circleGeometry args={[0.05, 20]} />
        <meshBasicMaterial color="#ff5a5a" toneMapped={false} />
      </mesh>
    </group>
  )
}

// ── El lienzo y el dibujo ───────────────────────────────────────────────────
// Fuera del componente: son objetos de Three.js que se modifican a propósito
// (redibujar y avisar que hay que subir la textura), no estado de React.

function crearLienzo(): { lienzo: HTMLCanvasElement | null; textura: CanvasTexture | null } {
  if (typeof document === 'undefined') return { lienzo: null, textura: null }
  const lienzo = document.createElement('canvas')
  lienzo.width = W
  lienzo.height = H
  const textura = new CanvasTexture(lienzo)
  textura.colorSpace = SRGBColorSpace
  textura.anisotropy = 8
  return { lienzo, textura }
}

function marcarParaSubir(textura: CanvasTexture) {
  textura.needsUpdate = true
}

function fuente(): string {
  if (typeof document === 'undefined') return 'system-ui, sans-serif'
  return getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'
}

function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Parte un texto en líneas que caben en `ancho`, con "…" si sobra. */
function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number): string[] {
  const palabras = texto.split(/\s+/)
  const salida: string[] = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (ctx.measureText(prueba).width <= ancho) {
      actual = prueba
      continue
    }
    if (actual) salida.push(actual)
    actual = p
    if (salida.length === max) break
  }
  if (salida.length < max && actual) salida.push(actual)
  if (salida.length > max) salida.length = max
  const usadas = salida.join(' ').split(/\s+/).length
  if (usadas < palabras.length && salida.length) {
    let ultima = salida[salida.length - 1]
    while (ultima && ctx.measureText(`${ultima}…`).width > ancho) ultima = ultima.slice(0, -1)
    salida[salida.length - 1] = `${ultima}…`
  }
  return salida
}

export function dibujarCola(
  ctx: CanvasRenderingContext2D,
  encargos: EncargoPantalla[],
  agentes: Record<string, AgenteDePantalla>,
  ahora: number,
) {
  const f = fuente()
  const fondo = ctx.createLinearGradient(0, 0, 0, H)
  fondo.addColorStop(0, '#111827')
  fondo.addColorStop(1, '#0b1020')
  ctx.fillStyle = fondo
  ctx.fillRect(0, 0, W, H)

  // Encabezado
  ctx.fillStyle = '#e8edf7'
  ctx.font = `700 64px ${f}`
  ctx.textBaseline = 'middle'
  ctx.fillText('Cola de encargos', 72, 92)
  const anchoTitulo = ctx.measureText('Cola de encargos').width
  ctx.font = `600 30px ${f}`
  ctx.fillStyle = '#ff7a7a'
  ctx.fillText('EN VIVO', 72 + anchoTitulo + 36, 96)
  ctx.fillStyle = '#7d8aa3'
  ctx.font = `500 30px ${f}`
  const hora = new Date(ahora).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const txtHora = `Actualizada ${hora}`
  ctx.fillText(txtHora, W - 72 - ctx.measureText(txtHora).width, 96)

  const cols = columnasDePantalla(encargos, ahora)
  const margen = 56
  const hueco = 28
  const anchoCol = (W - margen * 2 - hueco * 3) / 4
  const arriba = 170

  COLUMNAS_PANTALLA.forEach((col, i) => {
    const x = margen + i * (anchoCol + hueco)
    const lista = cols[col.id]

    // Columna
    ctx.fillStyle = 'rgba(255,255,255,0.035)'
    rectRedondo(ctx, x, arriba, anchoCol, H - arriba - 48, 28)
    ctx.fill()

    ctx.fillStyle = col.color
    rectRedondo(ctx, x + 28, arriba + 34, 16, 16, 8)
    ctx.fill()
    ctx.fillStyle = '#dfe5f1'
    ctx.font = `700 34px ${f}`
    ctx.fillText(col.titulo, x + 58, arriba + 42)
    ctx.fillStyle = col.color
    ctx.font = `700 34px ${f}`
    const n = String(lista.length)
    ctx.fillText(n, x + anchoCol - 28 - ctx.measureText(n).width, arriba + 42)

    // Tarjetas
    const altoTarjeta = 176
    const maxTarjetas = 4
    lista.slice(0, maxTarjetas).forEach((e, k) => {
      const ty = arriba + 88 + k * (altoTarjeta + 18)
      const agente = agentes[e.agenteId]
      ctx.fillStyle = '#1b2334'
      rectRedondo(ctx, x + 18, ty, anchoCol - 36, altoTarjeta, 22)
      ctx.fill()
      // Borde izquierdo del color del agente
      ctx.fillStyle = agente?.colorHex ?? '#8a8f98'
      rectRedondo(ctx, x + 18, ty, 10, altoTarjeta, 5)
      ctx.fill()

      ctx.fillStyle = '#f1f4fa'
      ctx.font = `600 32px ${f}`
      lineas(ctx, e.titulo, anchoCol - 90, 2).forEach((l, j) => ctx.fillText(l, x + 50, ty + 44 + j * 40))

      ctx.font = `500 26px ${f}`
      ctx.fillStyle = agente?.colorHex ?? '#8a8f98'
      const quien = agente?.nombre ?? 'Agente'
      ctx.fillText(quien, x + 50, ty + altoTarjeta - 34)
      ctx.fillStyle = '#7d8aa3'
      const cuando = haceCuanto(col.id === 'respondido' && e.respondidoAt ? e.respondidoAt : e.creadoAt, ahora)
      ctx.fillText(` · ${cuando}`, x + 50 + ctx.measureText(quien).width, ty + altoTarjeta - 34)
      if (e.prioridad === 'alta') {
        ctx.fillStyle = '#ff7a7a'
        ctx.font = `700 22px ${f}`
        const t = 'URGENTE'
        ctx.fillText(t, x + anchoCol - 40 - ctx.measureText(t).width, ty + altoTarjeta - 34)
      }
    })

    if (lista.length > maxTarjetas) {
      ctx.fillStyle = '#7d8aa3'
      ctx.font = `500 28px ${f}`
      ctx.fillText(`+${lista.length - maxTarjetas} más`, x + 32, H - 76)
    }
    if (lista.length === 0) {
      ctx.fillStyle = '#4c5870'
      ctx.font = `500 28px ${f}`
      ctx.fillText('Nada por ahora', x + 32, arriba + 120)
    }
  })
}
