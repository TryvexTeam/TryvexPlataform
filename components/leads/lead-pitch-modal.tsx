'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Mail, User, Camera, Globe, MapPin, Star, Loader2, Save, Pencil, RotateCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Lead, TurnoPitch } from '@/lib/types/lead'
import { ESTADOS_LEAD, RAZONES_PERDIDA } from '@/lib/types/lead'
import { generarGuion, generarGuionAuto } from '@/lib/leads/pitch'

/**
 * El modal de pitch: se abre desde el panel del lead, al lado de WhatsApp.
 *
 * Reúne lo que se necesita para una llamada en frío en una sola pantalla:
 *  1. Los datos de contacto que tenemos, a la vista — para confirmarlos con el
 *     cliente y corregirlos ahí mismo si están desactualizados (se guardan).
 *  2. El estado del lead, cambiable sin salir del modal.
 *  3. El guion personalizado del negocio (conversación completa), listo para leer.
 */
export function LeadPitchModal({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const guion = useMemo(() => generarGuion(lead), [lead])

  const [telefono, setTelefono] = useState(lead.telefono ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [nombreContacto, setNombreContacto] = useState(lead.nombre_contacto ?? '')
  const [estado, setEstado] = useState(lead.estado)
  const [razon, setRazon] = useState(lead.razon_perdida ?? '')
  const [guardando, setGuardando] = useState(false)

  // Edición del guion. `turnos` arranca del guion actual (editado o generado);
  // al entrar en modo edición se muestran textareas. Guardar persiste el arreglo.
  const [editandoGuion, setEditandoGuion] = useState(false)
  const [turnos, setTurnos] = useState<TurnoPitch[]>(guion.turnos)

  const contactoCambiado =
    telefono !== (lead.telefono ?? '') ||
    email !== (lead.email ?? '') ||
    nombreContacto !== (lead.nombre_contacto ?? '')
  const estadoCambiado = estado !== lead.estado
  const faltaRazon = estado === 'perdido' && !razon

  async function guardar() {
    if (faltaRazon) {
      toast.error('Elige una razón para “Perdido”')
      return
    }
    setGuardando(true)
    try {
      // El estado y el contacto van en llamadas SEPARADAS a propósito. El
      // estado siempre se puede guardar; los campos de contacto dependen de que
      // exista la columna (email/nombre_contacto, migración 083). Si van juntos
      // y la columna falta, la base rechaza TODO —incluido el estado— y el modal
      // queda inservible. Separados, cada parte falla o guarda por su cuenta.
      const patch = (body: Record<string, unknown>) =>
        fetch(`/api/leads/${lead.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

      let okEstado = true
      let okContacto = true

      if (estadoCambiado) {
        const body: Record<string, unknown> = { estado }
        if (estado === 'perdido') body.razon_perdida = razon
        okEstado = (await patch(body)).ok
      }
      if (contactoCambiado) {
        okContacto = (await patch({
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          nombre_contacto: nombreContacto.trim() || null,
        })).ok
      }

      if (okEstado && okContacto) {
        toast.success('Guardado')
        router.refresh()
      } else if (okEstado && !okContacto) {
        // Caso típico hasta aplicar la migración 083: el estado quedó guardado,
        // el contacto no. Se dice claro en vez de un "no se pudo" que miente.
        toast.error('Estado guardado. El contacto no se pudo guardar todavía.')
        router.refresh()
      } else {
        toast.error('No se pudo guardar')
      }
    } catch {
      toast.error('No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarGuion() {
    setGuardando(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch: turnos }),
      })
      if (!res.ok) throw new Error()
      toast.success('Guion guardado')
      setEditandoGuion(false)
      router.refresh()
    } catch {
      toast.error('No se pudo guardar el guion todavía')
    } finally {
      setGuardando(false)
    }
  }

  async function restaurarGuion() {
    const auto = generarGuionAuto(lead).turnos
    setTurnos(auto)
    setGuardando(true)
    try {
      // pitch = null vuelve al generado; si la columna aún no existe, igual queda
      // el generado en pantalla (solo no persiste hasta aplicar la migración).
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch: null }),
      })
      if (res.ok) {
        toast.success('Guion restaurado al original')
        setEditandoGuion(false)
        router.refresh()
      }
    } catch {
      /* el generado ya se ve en pantalla */
    } finally {
      setGuardando(false)
    }
  }

  const setTurno = (i: number, campo: 'texto' | 'guia', valor: string) =>
    setTurnos((ts) => ts.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)))

  const hayCambios = contactoCambiado || estadoCambiado
  const rating = lead.google_rating
  const resenas = lead.google_resenas

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="modal-pantalla-movil flex flex-col gap-0 p-0 max-w-none w-screen rounded-none overflow-hidden sm:w-full sm:max-w-2xl sm:rounded-2xl"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* El nombre del lead es lo que importa acá — con quién se va a hablar.
            El rating va al lado como dato secundario, no compitiendo en tamaño:
            antes se leía más grande que el propio nombre del negocio. */}
        <DialogTitle className="px-5 pt-4 pb-3 flex items-baseline gap-2 border-b border-white/[0.06]">
          <span className="text-[17px] font-semibold text-[var(--tx-ink-primary)]">
            {lead.nombre_negocio}
          </span>
          {rating != null && (
            <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-[var(--tx-ink-secondary)]" style={{ background: 'rgba(255,255,255,.06)' }}>
              <Star size={11} className="text-amber-400" fill="currentColor" />
              {String(rating).replace('.', ',')}
              {resenas != null ? ` (${resenas})` : ''}
            </span>
          )}
        </DialogTitle>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* ── Datos de contacto (editables) ── */}
          <section>
            <p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[var(--tx-ink-muted)]">
              Datos de contacto · confírmalos con el cliente
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Campo icon={User} label="Nombre de contacto" value={nombreContacto}
                onChange={setNombreContacto} placeholder="¿Con quién hablas?" />
              <Campo icon={Phone} label="Teléfono" value={telefono}
                onChange={setTelefono} placeholder="+56 9 …" type="tel" />
              <Campo icon={Mail} label="Correo" value={email}
                onChange={setEmail} placeholder="correo@…" type="email" className="sm:col-span-2" />
            </div>
            {/* Solo-lectura: lo que el scraper ya sabe */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--tx-ink-secondary)]">
              <span className="inline-flex items-center gap-1">
                <Globe size={13} />{lead.tiene_web ? (lead.url_web ?? 'Con web') : 'Sin web'}
              </span>
              {lead.instagram && (
                <a href={lead.instagram} target="_blank" rel="noopener"
                  className="inline-flex items-center gap-1 hover:text-[var(--tx-ink-primary)]">
                  <Camera size={13} />Instagram
                </a>
              )}
              {lead.localidad && (
                <span className="inline-flex items-center gap-1"><MapPin size={13} />{lead.localidad}</span>
              )}
            </div>
          </section>

          {/* ── Estado ── */}
          <section>
            <p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-[var(--tx-ink-muted)]">
              Estado del lead
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS_LEAD.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEstado(e.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    estado === e.id
                      ? 'border-transparent text-black font-semibold'
                      : 'border-white/[0.08] bg-white/[0.02] text-[var(--tx-ink-secondary)] hover:bg-white/[0.06]'
                  }`}
                  style={estado === e.id ? { background: e.color } : undefined}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                  {e.label}
                </button>
              ))}
            </div>
            {estado === 'perdido' && (
              <select
                value={razon}
                onChange={(ev) => setRazon(ev.target.value)}
                className="mt-2.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[13px] text-[var(--tx-ink-primary)]"
              >
                <option value="">Razón de la pérdida…</option>
                {RAZONES_PERDIDA.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            )}
          </section>

          {/* ── Guion (vista previa / edición) ── */}
          <section>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--tx-ink-muted)]">
                Guion de llamada en frío{guion.editado && !editandoGuion ? ' · editado' : ''}
              </p>
              {!editandoGuion ? (
                <button
                  type="button"
                  onClick={() => { setTurnos(guion.turnos); setEditandoGuion(true) }}
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
                >
                  <Pencil size={12} /> Editar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={restaurarGuion}
                  disabled={guardando}
                  className="inline-flex items-center gap-1 text-[12px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] disabled:opacity-40"
                >
                  <RotateCcw size={12} /> Restaurar original
                </button>
              )}
            </div>
            <p className="mb-3 text-[12.5px] text-[var(--tx-ink-muted)]">
              <span className="font-medium text-[var(--tx-ink-secondary)]">Qué ofrecerle:</span> {guion.resumen}
            </p>

            {!editandoGuion ? (
              <div className="space-y-3">
                {guion.turnos.map((t, i) => (
                  <div key={i} className="border-l-2 border-green-500/40 pl-3">
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-green-400/90 mb-1">
                      {t.rol}
                    </span>
                    <p className="rounded-lg bg-white/[0.03] px-3 py-2.5 text-[14px] leading-relaxed text-[var(--tx-ink-primary)]"
                      dangerouslySetInnerHTML={{ __html: negritas(t.texto) }} />
                    {t.guia && (
                      <p className="mt-1.5 text-[12px] italic text-[var(--tx-ink-muted)]">{t.guia}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11.5px] text-[var(--tx-ink-muted)]">
                  Edita lo que dirás. Usa <code className="text-green-400">**texto**</code> para resaltar en negrita.
                </p>
                {turnos.map((t, i) => (
                  <div key={i} className="border-l-2 border-green-500/40 pl-3">
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-green-400/90 mb-1">
                      {t.rol}
                    </span>
                    <textarea
                      value={t.texto}
                      onChange={(e) => setTurno(i, 'texto', e.target.value)}
                      rows={Math.max(2, Math.ceil(t.texto.length / 55))}
                      className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[14px] leading-relaxed text-[var(--tx-ink-primary)] focus:border-green-500/40 focus:outline-none"
                    />
                    <input
                      value={t.guia ?? ''}
                      onChange={(e) => setTurno(i, 'guia', e.target.value)}
                      placeholder="Nota de ayuda (opcional)"
                      className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[12px] italic text-[var(--tx-ink-muted)] focus:border-white/[0.08] focus:outline-none"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={guardarGuion}
                  disabled={guardando}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-green-500 px-4 py-2 text-[13px] font-semibold text-black transition-opacity disabled:opacity-40"
                >
                  {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Guardar guion
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ── Barra de guardar ── */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-3">
          <span className="text-[12px] text-[var(--tx-ink-muted)]">
            {hayCambios ? 'Cambios sin guardar' : 'Sin cambios'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-3.5 py-2 text-[13px] text-[var(--tx-ink-secondary)] hover:bg-white/[0.05]"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={!hayCambios || guardando || faltaRazon}
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-500 px-4 py-2 text-[13px] font-semibold text-black transition-opacity disabled:opacity-40"
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Campo({
  icon: Icon, label, value, onChange, placeholder, type = 'text', className = '',
}: {
  icon: typeof Phone
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--tx-ink-muted)]">
        <Icon size={12} />{label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[13.5px] text-[var(--tx-ink-primary)] placeholder:text-[var(--tx-ink-muted)] focus:border-green-500/40 focus:outline-none"
      />
    </label>
  )
}

/** Convierte **texto** en <strong> — el guion marca así lo que hay que enfatizar. */
function negritas(s: string): string {
  const esc = s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong class="text-green-300 font-semibold">$1</strong>')
}
