import { describe, it, expect } from 'vitest'
import { SEPARACION_X, distribuirConZonas, distribuirOficina, lugarFrenteAPantalla, rutaAPantalla } from './distribucion-oficina'

describe('distribuirOficina', () => {
  it('sin agentes, una sala vacía pero válida', () => {
    const d = distribuirOficina(0)
    expect(d.puestos).toEqual([])
    expect(d.sala[0]).toBeGreaterThan(0)
  })

  it('un agente queda al centro', () => {
    expect(distribuirOficina(1).puestos).toEqual([[0, 0]])
  })

  it('pocos agentes: una fila centrada', () => {
    const { puestos } = distribuirOficina(3)
    expect(puestos.map(([, z]) => z)).toEqual([0, 0, 0])
    expect(puestos[0][0]).toBeCloseTo(-SEPARACION_X)
    expect(puestos[2][0]).toBeCloseTo(SEPARACION_X)
  })

  it('ningún escritorio se pisa con otro y todos caben en la sala', () => {
    for (const n of [2, 5, 6, 8, 11]) {
      const { puestos, sala } = distribuirOficina(n)
      expect(puestos, `n=${n}`).toHaveLength(n)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(puestos[i][0] - puestos[j][0], puestos[i][1] - puestos[j][1])
          expect(d, `n=${n} ${i}-${j}`).toBeGreaterThan(2.5)
        }
        expect(Math.abs(puestos[i][0]), `n=${n}`).toBeLessThan(sala[0] / 2)
        expect(Math.abs(puestos[i][1]), `n=${n}`).toBeLessThan(sala[1] / 2)
      }
    }
  })

  it('la última fila incompleta se centra', () => {
    const { puestos } = distribuirOficina(5)
    const ultimaZ = Math.max(...puestos.map(([, z]) => z))
    const ultima = puestos.filter(([, z]) => z === ultimaZ).map(([x]) => x)
    expect(ultima.reduce((a, b) => a + b, 0)).toBeCloseTo(0)
  })
})

describe('distribuirConZonas', () => {
  it('las zonas no caen encima de ningún escritorio y quedan dentro de la sala', () => {
    for (const n of [1, 3, 6, 8, 11]) {
      const { puestos, sala, zonas } = distribuirConZonas(n)
      for (const [nombre, [zx, zz]] of Object.entries(zonas)) {
        for (const [px, pz] of puestos) {
          expect(Math.hypot(zx - px, zz - pz), `n=${n} ${nombre}`).toBeGreaterThan(2.2)
        }
        expect(Math.abs(zx), `n=${n} ${nombre}`).toBeLessThan(sala[0] / 2)
        expect(Math.abs(zz), `n=${n} ${nombre}`).toBeLessThan(sala[1] / 2)
      }
    }
  })
})

/** ¿El segmento a→b pasa por encima de algún escritorio (con un margen)? */
function cruzaEscritorio(a: [number, number], b: [number, number], puestos: Array<[number, number]>, ignorar: number) {
  for (let t = 0; t <= 1; t += 0.02) {
    const x = a[0] + (b[0] - a[0]) * t
    const z = a[1] + (b[1] - a[1]) * t
    for (let i = 0; i < puestos.length; i++) {
      if (i === ignorar) continue
      const [dx, dz] = puestos[i]
      // Escritorio + silla: de z-1.0 a z+0.8, de x-1.1 a x+1.1.
      if (Math.abs(x - dx) < 1.15 && z > dz - 1.0 && z < dz + 0.85) return true
    }
  }
  return false
}

describe('rutaAPantalla', () => {
  it('va por el pasillo sin atravesar escritorios ajenos', () => {
    for (const n of [1, 3, 6, 8, 11]) {
      const { puestos, zonas } = distribuirConZonas(n)
      puestos.forEach((p, i) => {
        const destino = lugarFrenteAPantalla(i, n, zonas.cola, 6)
        const ruta = rutaAPantalla(p, destino)
        for (let k = 1; k < ruta.length; k++) {
          expect(cruzaEscritorio(ruta[k - 1], ruta[k], puestos, i), `n=${n} agente ${i} tramo ${k}`).toBe(false)
        }
      })
    }
  })

  it('termina frente a la pantalla, sin pisarla', () => {
    const { zonas } = distribuirConZonas(4)
    const [x, z] = lugarFrenteAPantalla(0, 4, zonas.cola, 6)
    expect(z).toBeGreaterThan(zonas.cola[1] + 1)
    expect(Math.abs(x - zonas.cola[0])).toBeLessThan(3)
  })

  it('cada uno tiene su lugar frente a la pantalla', () => {
    const { zonas } = distribuirConZonas(6)
    const lugares = Array.from({ length: 6 }, (_, i) => lugarFrenteAPantalla(i, 6, zonas.cola, 6))
    for (let i = 1; i < 6; i++) expect(lugares[i][0] - lugares[i - 1][0]).toBeGreaterThan(0.7)
  })
})
