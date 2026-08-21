'use client'

import { useState } from 'react'
import { ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import type { IntegranteAcceso, ResultadoAcceso } from '@/lib/types/acceso'

interface AccesoEquipoProps {
  equipoInicial: IntegranteAcceso[]
  /** Para tachar el botón de uno mismo. El endpoint lo revalida igual. */
  miIntegranteId: string
}

export function AccesoEquipo({ equipoInicial, miIntegranteId }: AccesoEquipoProps) {
  const [equipo, setEquipo] = useState<IntegranteAcceso[]>(equipoInicial)
  const [aRevocar, setARevocar] = useState<IntegranteAcceso | null>(null)
  const [confirmacion, setConfirmacion] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // El nombre escrito tiene que coincidir. Se compara sin acentos ni mayúsculas
  // porque el objetivo es forzar una pausa deliberada, no ganarle a un teclado.
  const nombreEsperado = aRevocar?.nombre ?? ''
  const coincide =
    normalizar(confirmacion) !== '' && normalizar(confirmacion) === normalizar(nombreEsperado)

  function cerrarDialogo() {
    setARevocar(null)
    setConfirmacion('')
    setMotivo('')
  }

  async function cambiarAcceso(integrante: IntegranteAcceso, activo: boolean, razon?: string) {
    setEnviando(true)
    try {
      const res = await fetch('/api/admin/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrante_id: integrante.id, activo, motivo: razon || undefined }),
      })
      const cuerpo = await res.json().catch(() => null)

      if (!res.ok || !cuerpo?.success) {
        throw new Error(typeof cuerpo?.error === 'string' ? cuerpo.error : 'No se pudo cambiar el acceso')
      }

      const data = cuerpo.data as ResultadoAcceso
      setEquipo((prev) => prev.map((i) => (i.id === integrante.id ? { ...i, activo } : i)))

      if (activo) {
        toast.success('Acceso restaurado', { description: `${integrante.nombre} ya puede entrar` })
      } else {
        // Se informa el número de sesiones cerradas, no un "listo" genérico. Es la
        // diferencia entre marcar una casilla y haber echado a alguien de verdad.
        toast.success('Acceso revocado', {
          description:
            data.sesiones_cerradas > 0
              ? `${integrante.nombre}: ${data.sesiones_cerradas} ${data.sesiones_cerradas === 1 ? 'sesión cerrada' : 'sesiones cerradas'} y no podrá volver a entrar`
              : `${integrante.nombre} no tenía sesiones abiertas y no podrá volver a entrar`,
        })
      }
      cerrarDialogo()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el acceso')
    } finally {
      setEnviando(false)
    }
  }

  if (equipo.length === 0) {
    return <p className="text-sm text-[var(--tx-ink-muted)]">Todavía no hay integrantes.</p>
  }

  return (
    <>
      <ul className="space-y-2">
        {equipo.map((integrante) => {
          const soyYo = integrante.id === miIntegranteId
          return (
            <li
              key={integrante.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--tx-border)] p-4"
              style={{ opacity: integrante.activo ? 1 : 0.65 }}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-[var(--tx-ink-primary)]">
                  <span className="truncate">{integrante.nombre}</span>
                  {integrante.es_superadmin && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--tx-border-strong)] px-2 py-0.5 text-[11px] font-medium text-[var(--tx-ink-secondary)]">
                      <ShieldCheck size={11} /> Dueño
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-[var(--tx-ink-muted)]">{integrante.email}</p>
              </div>

              <span
                className={
                  integrante.activo
                    ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400'
                    : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[var(--tx-ink-secondary)]'
                }
              >
                {integrante.activo ? <UserCheck size={12} /> : <ShieldOff size={12} />}
                {integrante.activo ? 'Con acceso' : 'Sin acceso'}
              </span>

              {integrante.activo ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  /* Uno no se revoca a sí mismo: dejaría la cuenta sin quien
                     pueda revertirlo. El endpoint lo rechaza igual. */
                  disabled={soyYo || enviando}
                  title={soyYo ? 'No puedes quitarte el acceso a ti mismo' : undefined}
                  onClick={() => {
                    setARevocar(integrante)
                    setConfirmacion('')
                    setMotivo('')
                  }}
                >
                  <UserX size={14} /> Quitar acceso
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={enviando}
                  /* Restaurar no pide confirmación: devolver el acceso es
                     reversible con un clic, quitarlo no. */
                  onClick={() => cambiarAcceso(integrante, true)}
                >
                  <UserCheck size={14} /> Devolver acceso
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      {/* Escribir el nombre no es burocracia: quitar el acceso cierra las sesiones
          abiertas de una persona y le impide volver a entrar. Un botón suelto se
          aprieta sin querer al pasar por la lista; esto obliga a mirar a quién. */}
      <Dialog open={aRevocar !== null} onOpenChange={(abierto: boolean) => !abierto && cerrarDialogo()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quitar el acceso a {nombreEsperado}</DialogTitle>
            <DialogDescription>
              Se cerrarán sus sesiones abiertas ahora mismo y no podrá volver a iniciar sesión.
              Puedes devolvérselo después desde esta misma pantalla.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="confirmar-nombre">
                Escribe <span className="font-semibold text-[var(--tx-ink-primary)]">{nombreEsperado}</span> para confirmar
              </Label>
              <Input
                id="confirmar-nombre"
                value={confirmacion}
                autoComplete="off"
                placeholder={nombreEsperado}
                onChange={(e) => setConfirmacion(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo-revocacion">Motivo (opcional)</Label>
              <Textarea
                id="motivo-revocacion"
                value={motivo}
                rows={2}
                maxLength={500}
                placeholder="Queda guardado en el registro de accesos"
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarDialogo} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!coincide || enviando}
              onClick={() => aRevocar && cambiarAcceso(aRevocar, false, motivo)}
            >
              {enviando ? 'Quitando acceso...' : 'Quitar acceso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Minúsculas, sin acentos y sin espacios de sobra. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}
