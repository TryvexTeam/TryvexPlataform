import { CanvasTexture, Color, SRGBColorSpace } from 'three'
import type { TrajeAgente } from '@/lib/agentes/estilo-agente'

/**
 * El traje, pintado en el cuerpo del robot.
 *
 * El cuerpo es una esfera: su textura la envuelve como un mapamundi. El ancho
 * del lienzo da la vuelta completa y el FRENTE del robot (lo que mira a la
 * cámara) cae en el primer cuarto; el alto va de arriba (cuello) a abajo.
 * Todo lo que se dibuja se centra en CX.
 *
 * Una textura por combinación de traje y color, compartida: diez agentes de
 * bata azul usan la misma.
 */

const W = 1024
const H = 512
/** El centro del frente del robot en el lienzo. */
const CX = W * 0.25

const cache = new Map<string, CanvasTexture>()

/** El mismo gris que las mangas en DEFINICION_TRAJE.poleron. */
const GRIS_POLERON = '#9aa1ad'

export function pielDe(traje: TrajeAgente, color: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const clave = `${traje}:${color}`
  const hecha = cache.get(clave)
  if (hecha) return hecha

  const lienzo = document.createElement('canvas')
  lienzo.width = W
  lienzo.height = H
  const ctx = lienzo.getContext('2d')
  if (!ctx) return null
  DIBUJOS[traje](ctx, color)

  const t = new CanvasTexture(lienzo)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  cache.set(clave, t)
  return t
}

function oscurecer(color: string, f: number): string {
  return `#${new Color(color).multiplyScalar(f).getHexString()}`
}

function fondo(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, W, H)
}

function redondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const DIBUJOS: Record<TrajeAgente, (ctx: CanvasRenderingContext2D, color: string) => void> = {
  liso(ctx, color) {
    fondo(ctx, color)
  },

  esmoquin(ctx) {
    fondo(ctx, '#17181c')
    // Solapas: un brillo satinado apenas más claro a los lados de la camisa.
    ctx.fillStyle = '#23252b'
    ctx.beginPath()
    ctx.moveTo(CX - 118, 70)
    ctx.lineTo(CX - 6, 330)
    ctx.lineTo(CX - 60, 330)
    ctx.lineTo(CX - 150, 70)
    ctx.moveTo(CX + 118, 70)
    ctx.lineTo(CX + 6, 330)
    ctx.lineTo(CX + 60, 330)
    ctx.lineTo(CX + 150, 70)
    ctx.fill()
    // Camisa blanca en V
    ctx.fillStyle = '#fbfbfc'
    ctx.beginPath()
    ctx.moveTo(CX - 92, 64)
    ctx.lineTo(CX + 92, 64)
    ctx.lineTo(CX, 336)
    ctx.closePath()
    ctx.fill()
    // Botones
    ctx.fillStyle = '#17181c'
    for (const y of [190, 240, 286]) {
      ctx.beginPath()
      ctx.arc(CX, y, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    // Humita
    ctx.fillStyle = '#0b0b0d'
    ctx.beginPath()
    ctx.moveTo(CX, 112)
    ctx.lineTo(CX - 56, 84)
    ctx.lineTo(CX - 56, 142)
    ctx.closePath()
    ctx.moveTo(CX, 112)
    ctx.lineTo(CX + 56, 84)
    ctx.lineTo(CX + 56, 142)
    ctx.closePath()
    ctx.fill()
    redondo(ctx, CX - 14, 98, 28, 28, 8)
    ctx.fill()
    // Pañuelo en el bolsillo
    ctx.fillStyle = '#fbfbfc'
    ctx.beginPath()
    ctx.moveTo(CX + 150, 176)
    ctx.lineTo(CX + 196, 176)
    ctx.lineTo(CX + 182, 150)
    ctx.lineTo(CX + 168, 164)
    ctx.lineTo(CX + 160, 148)
    ctx.closePath()
    ctx.fill()
  },

  bata(ctx, color) {
    fondo(ctx, '#f4f6f9')
    // Camisa del color del agente, en V
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(CX - 70, 60)
    ctx.lineTo(CX + 70, 60)
    ctx.lineTo(CX, 250)
    ctx.closePath()
    ctx.fill()
    // Abertura de la bata y solapas
    ctx.strokeStyle = '#cfd5de'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(CX - 70, 60)
    ctx.lineTo(CX, 250)
    ctx.lineTo(CX + 70, 60)
    ctx.moveTo(CX, 250)
    ctx.lineTo(CX, H)
    ctx.stroke()
    // Bolsillos
    ctx.lineWidth = 5
    for (const x of [CX - 170, CX + 70]) {
      redondo(ctx, x, 300, 100, 80, 14)
      ctx.stroke()
    }
    // Lápiz en el bolsillo del pecho
    redondo(ctx, CX + 110, 120, 70, 50, 10)
    ctx.stroke()
    ctx.fillStyle = oscurecer(color, 0.8)
    redondo(ctx, CX + 132, 92, 12, 44, 5)
    ctx.fill()
  },

  poleron(ctx, color) {
    // Gris jaspeado, como un polerón de verdad; el color del agente va en los
    // detalles. Así se distingue de un vistazo del cuerpo liso.
    const gris = GRIS_POLERON
    fondo(ctx, gris)
    // Cuello de la capucha caída
    ctx.fillStyle = oscurecer(gris, 0.78)
    ctx.fillRect(0, 60, W, 96)
    // Bolsillo canguro
    ctx.fillStyle = oscurecer(gris, 0.88)
    ctx.beginPath()
    ctx.moveTo(CX - 120, 200)
    ctx.lineTo(CX + 120, 200)
    ctx.lineTo(CX + 160, 320)
    ctx.lineTo(CX - 160, 320)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = oscurecer(gris, 0.7)
    ctx.lineWidth = 6
    ctx.stroke()
    // Cordones del color del agente, con puntera
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 10
    ctx.lineCap = 'round'
    for (const x of [CX - 34, CX + 34]) {
      const fin = x + (x < CX ? -8 : 8)
      ctx.beginPath()
      ctx.moveTo(x, 156)
      ctx.lineTo(fin, 214)
      ctx.stroke()
      redondo(ctx, fin - 7, 210, 14, 22, 5)
      ctx.fill()
    }
    // Puño elástico abajo, toda la vuelta
    ctx.fillStyle = oscurecer(gris, 0.8)
    ctx.fillRect(0, H - 70, W, 70)
  },

  overol(ctx, color) {
    const mezclilla = '#3b5b8c'
    fondo(ctx, color)
    // Parte de abajo, de mezclilla, toda la vuelta
    ctx.fillStyle = mezclilla
    ctx.fillRect(0, 262, W, H - 262)
    // Peto
    redondo(ctx, CX - 100, 130, 200, 160, 18)
    ctx.fill()
    // Bolsillo del peto
    ctx.strokeStyle = '#5577aa'
    ctx.lineWidth = 5
    redondo(ctx, CX - 46, 170, 92, 64, 10)
    ctx.stroke()
    // Tirantes, hasta arriba y por la espalda
    ctx.strokeStyle = mezclilla
    ctx.lineWidth = 30
    for (const x of [CX - 78, CX + 78]) {
      ctx.beginPath()
      ctx.moveTo(x, 140)
      ctx.lineTo(x, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + W / 2, H * 0.55)
      ctx.lineTo(x + W / 2, 0)
      ctx.stroke()
    }
    // Botones dorados
    ctx.fillStyle = '#e9b949'
    for (const x of [CX - 78, CX + 78]) {
      ctx.beginPath()
      ctx.arc(x, 150, 11, 0, Math.PI * 2)
      ctx.fill()
    }
  },
}
