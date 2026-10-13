import { isIP } from 'node:net'

/** Valida y normaliza una IP cruda de cabecera: sin puerto, IPv4-mapeada a IPv4. */
function normalizarIp(cruda: string | null | undefined): string | null {
  let ip = cruda?.trim()
  if (!ip) return null
  const conPuertoV6 = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
  if (conPuertoV6) ip = conPuertoV6[1]
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(':'))
  const mapeada = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapeada) ip = mapeada[1]
  return isIP(ip) ? ip : null
}

export function ipCliente(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return normalizarIp(real)
  return normalizarIp(headers.get('x-forwarded-for')?.split(',')[0])
}
