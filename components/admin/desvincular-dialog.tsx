'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import type { IntegranteAcceso, IpCandidata } from '@/lib/types/acceso'

type Props = { integrante: IntegranteAcceso | null; onClose: () => void; onDone: (id: string) => void }

export function DesvincularDialog({ integrante, onClose, onDone }: Props) {
  const [ips, setIps] = useState<IpCandidata[]>([])
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [confirmacion, setConfirmacion] = useState('')
  const [motivo, setMotivo] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!integrante) return
    queueMicrotask(() => { setConfirmacion(''); setMotivo(''); setIps([]); setCargando(true) })
    fetch(`/api/admin/acceso/ips?integrante=${encodeURIComponent(integrante.id)}`)
      .then((r) => r.json()).then((cuerpo) => {
        if (!cuerpo.success) throw new Error(cuerpo.error)
        const candidatas = cuerpo.data as IpCandidata[]
        setIps(candidatas)
        setElegidas(new Set(candidatas.filter((ip) => ip.origen === 'app' && ip.compartida_con.length === 0 && !ip.es_tuya).map((ip) => ip.ip)))
      }).catch((error) => toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las IPs'))
      .finally(() => setCargando(false))
  }, [integrante])

  async function desvincular() {
    if (!integrante) return
    setCargando(true)
    try {
      const respuesta = await fetch('/api/admin/acceso/desvincular', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrante_id: integrante.id, ips: [...elegidas], motivo: motivo || undefined, confirmacion }),
      })
      const cuerpo = await respuesta.json()
      if (!respuesta.ok || !cuerpo.success) throw new Error(`${cuerpo.error ?? 'No se pudo desvincular'}${cuerpo.etapa ? ` (etapa: ${cuerpo.etapa})` : ''}`)
      toast.success('Integrante desvinculado', { description: `${cuerpo.data.sesionesCerradas} sesiones cerradas · ${cuerpo.data.ipsBloqueadas.length} IPs bloqueadas` })
      onDone(integrante.id); onClose()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo desvincular') }
    finally { setCargando(false) }
  }

  return <Dialog open={integrante !== null} onOpenChange={(abierto) => !abierto && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>Desvincular de Tryvex</DialogTitle><DialogDescription>Se eliminará la cuenta, se cerrarán sus sesiones y se bloquearán las IPs elegidas. Su nombre y su historial se conservarán.</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-500"><AlertTriangle className="mr-2 inline h-4 w-4" />Esta acción requiere una invitación nueva para volver.</div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium text-[var(--tx-ink-primary)]">IPs que se bloquearán</legend>
          {cargando && ips.length === 0 ? <p className="text-sm text-[var(--tx-ink-muted)]">Consultando redes…</p> : ips.length === 0 ? <p className="text-sm text-[var(--tx-ink-muted)]">No se encontraron IPs recientes.</p> : ips.map((fila) => <label key={fila.ip} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--tx-border)] p-3">
            <Checkbox disabled={fila.compartida_con.length > 0 || fila.es_tuya === true} checked={elegidas.has(fila.ip)} onCheckedChange={(valor) => setElegidas((actuales) => { const copia = new Set(actuales); if (valor === true) copia.add(fila.ip); else copia.delete(fila.ip); return copia })} aria-label={`Bloquear IP ${fila.ip}`} />
            <span className="min-w-0"><span className="block font-mono text-sm text-[var(--tx-ink-primary)]">{fila.ip}</span><span className="block text-xs text-[var(--tx-ink-muted)]">{fila.es_tuya ? 'Es tu IP actual: no se puede bloquear' : fila.compartida_con.length > 0 ? `No se puede bloquear: también la usa ${fila.compartida_con.join(', ')}` : fila.origen === 'sesion' ? 'Puede ser IP de un servidor' : 'Registrada desde la app'}</span></span>
          </label>)}</fieldset>
        <div className="space-y-1.5"><Label htmlFor="motivo-desvincular">Motivo (opcional)</Label><Textarea id="motivo-desvincular" value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="confirmar-desvincular">Escriba el nombre exacto: <strong>{integrante?.nombre}</strong></Label><Input id="confirmar-desvincular" value={confirmacion} autoComplete="off" onChange={(e) => setConfirmacion(e.target.value)} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={cargando}>Cancelar</Button><Button variant="destructive" onClick={desvincular} disabled={cargando || confirmacion !== integrante?.nombre}>{cargando ? 'Desvinculando…' : 'Desvincular definitivamente'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
