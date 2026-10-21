/**
 * Aritmética decimal exacta para montos que llegan como string.
 *
 * Los totales de `tryvex.metrics/v1` vienen como texto ("1234.50") justamente
 * para no pasar por `number`: 0.1 + 0.2 da 0.30000000000000004 en coma
 * flotante, y una comisión mal sumada es una discusión con el cliente. Acá todo
 * se lleva a BigInt con una escala fija y se vuelve a texto al final.
 */

/** Monto no negativo, hasta 15 enteros y 4 decimales. */
export const DECIMAL_RE = /^(0|[1-9]\d{0,14})(\.\d{1,4})?$/

/** Decimales internos: 4 del monto + 2 del porcentaje + 2 del "/100". */
const ESCALA = 8
const FACTOR = BigInt(10) ** BigInt(ESCALA)

/** Valor exacto escalado por 10^8. Opaco a propósito: se opera con las funciones de abajo. */
export type Decimal = { readonly unidades: bigint }

export function esDecimalValido(texto: string): boolean {
  return DECIMAL_RE.test(texto)
}

/** Lanza si el texto no es un decimal válido: el esquema ya lo filtró antes. */
export function decimal(texto: string): Decimal {
  if (!DECIMAL_RE.test(texto)) throw new Error(`Decimal inválido: ${texto}`)
  const [entero, fraccion = ''] = texto.split('.')
  const unidades = BigInt(entero) * FACTOR + BigInt(fraccion.padEnd(ESCALA, '0'))
  return { unidades }
}

export const CERO: Decimal = { unidades: BigInt(0) }

export function sumar(a: Decimal, b: Decimal): Decimal {
  return { unidades: a.unidades + b.unidades }
}

export function restar(a: Decimal, b: Decimal): Decimal {
  return { unidades: a.unidades - b.unidades }
}

export function comparar(a: Decimal, b: Decimal): -1 | 0 | 1 {
  if (a.unidades === b.unidades) return 0
  return a.unidades < b.unidades ? -1 : 1
}

/**
 * `a * pct / 100` exacto. El porcentaje admite 2 decimales (NUMERIC(5,2)), así
 * que con la escala de 8 el resultado de un monto de 4 decimales no se trunca.
 */
export function porcentajeDe(a: Decimal, porcentaje: Decimal): Decimal {
  // a y pct están escalados por 10^8: el producto queda en 10^16; se divide
  // por 10^8 para volver a la escala y por 100 por el porcentaje.
  const producto = a.unidades * porcentaje.unidades
  const divisor = FACTOR * BigInt(100)
  return { unidades: dividirRedondeando(producto, divisor) }
}

/** División entera con redondeo "mitad hacia arriba" (valores no negativos). */
function dividirRedondeando(n: bigint, d: bigint): bigint {
  const cociente = n / d
  const resto = n % d
  return resto * BigInt(2) >= d ? cociente + BigInt(1) : cociente
}

/** ¿`parte` supera `fraccion` (0..1 en decimal) de `total`? Exacto, sin dividir. */
export function superaFraccion(parte: Decimal, total: Decimal, porcentaje: number): boolean {
  // parte > total * pct / 100  ⇔  parte * 100 > total * pct
  return parte.unidades * BigInt(100) > total.unidades * BigInt(porcentaje)
}

/** Texto canónico: sin ceros sobrantes a la derecha ("12.50" → "12.5", "3.0" → "3"). */
export function aTexto(a: Decimal): string {
  const negativo = a.unidades < BigInt(0)
  const abs = negativo ? -a.unidades : a.unidades
  const entero = abs / FACTOR
  const fraccion = (abs % FACTOR).toString().padStart(ESCALA, '0').replace(/0+$/, '')
  return `${negativo ? '-' : ''}${entero}${fraccion ? `.${fraccion}` : ''}`
}

/** Redondea (mitad hacia arriba) a `decimales` y devuelve texto con esa cantidad fija. */
export function redondearTexto(a: Decimal, decimales: number): string {
  const negativo = a.unidades < BigInt(0)
  const abs = negativo ? -a.unidades : a.unidades
  const paso = BigInt(10) ** BigInt(ESCALA - decimales)
  const redondeado = dividirRedondeando(abs, paso)
  const base = BigInt(10) ** BigInt(decimales)
  const entero = redondeado / base
  const fraccion = decimales > 0 ? `.${(redondeado % base).toString().padStart(decimales, '0')}` : ''
  return `${negativo ? '-' : ''}${entero}${fraccion}`
}
