'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import type { IpBloqueada } from '@/lib/types/acceso'

export function IpsBloqueadas({ iniciales }: { iniciales: IpBloqueada[] }) {
  const [ips, setIps] = useState(iniciales)
  const [procesando, setProcesando] = useState<string | null>(null)
  async function desbloquear(ip: string) {
    setProcesando(ip)
    try {
      const respuesta = await fetch(`/api/admin/ips-bloqueadas?ip=${encodeURIComponent(ip)}`, { method: 'DELETE' })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok || !cuerpo.success) throw new Error(cuerpo.error ?? 'No se pudo desbloquear')
      setIps((actuales) => actuales.filter((fila) => fila.ip !== ip)); toast.success('IP desbloqueada')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo desbloquear') }
    finally { setProcesando(null) }
  }
  return <section className="space-y-3" aria-labelledby="ips-bloqueadas-titulo"><div><h2 id="ips-bloqueadas-titulo" className="text-base font-semibold text-[var(--tx-ink-primary)]">IPs bloqueadas</h2><p className="text-sm text-[var(--tx-ink-muted)]">Redes que no pueden abrir Tryvex.</p></div>
    {ips.length === 0 ? <p className="rounded-xl border border-[var(--tx-border)] p-4 text-sm text-[var(--tx-ink-muted)]">No hay IPs bloqueadas.</p> : <ul className="space-y-2">{ips.map((fila) => <li key={fila.ip} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--tx-border)] p-3"><div className="min-w-0 flex-1"><p className="font-mono text-sm text-[var(--tx-ink-primary)]">{fila.ip}</p><p className="text-xs text-[var(--tx-ink-muted)]">{fila.integrante_nombre ?? 'Sin integrante'}{fila.motivo ? ` · ${fila.motivo}` : ''}</p></div><Button size="sm" variant="outline" disabled={procesando === fila.ip} onClick={() => desbloquear(fila.ip)}>Desbloquear</Button></li>)}</ul>}
  </section>
}
