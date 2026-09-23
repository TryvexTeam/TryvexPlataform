'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BatteryFull, Camera, CheckCheck, ChevronLeft, Mic, Paperclip, Pause, Phone, Play,
  RotateCcw, SendHorizontal, Signal, Smile, Video, Wifi,
} from 'lucide-react'
import { iniciales, simularConversacion } from '@/lib/vex/simulacion-demo'

/**
 * Un teléfono que muestra, animada, la conversación que tendría un cliente
 * con el asistente de la demo.
 *
 * Existe para vender la demo antes de activarla: el dueño ve su negocio en un
 * WhatsApp que se mueve, con su nombre arriba, y entiende en diez segundos qué
 * va a probar. La conversación sale de `simularConversacion`, que respeta lo
 * que la demo real puede hacer (sin precios ni confirmaciones inventadas).
 *
 * Accesibilidad: la animación es decorativa para lectores de pantalla (que
 * reciben la conversación completa como texto), se puede pausar (WCAG 2.2.2,
 * se mueve más de cinco segundos), se detiene sola cuando el teléfono sale de
 * pantalla, y con "reducir movimiento" se muestra quieta y completa.
 */

interface TelefonoDemoProps {
  nombreNegocio: string
  rubro: string | null
}

// WhatsApp en modo oscuro. Van fijos y no en tokens del tema a propósito: son
// los colores de OTRA app, y el dueño tiene que reconocerla al primer vistazo.
const WA = {
  fondo: '#0b141a',
  barra: '#1f2c34',
  saliente: '#005c4b',
  entrante: '#1f2c34',
  texto: '#e9edef',
  meta: '#8696a0',
  visto: '#53bdeb',
  verde: '#00a884',
}

/** Se muestran "10:24", "10:24", "10:25"… como en un chat de verdad. */
function horaDe(indice: number): string {
  return `10:${String(24 + Math.floor(indice / 2)).padStart(2, '0')}`
}

/** Espera `ms` de tiempo VISIBLE: si el teléfono sale de pantalla o se pausa, el reloj se detiene. */
function crearEspera(puedeAvanzar: () => boolean, vivo: () => boolean) {
  return (ms: number) =>
    new Promise<void>((listo) => {
      let restante = ms
      const paso = () => {
        if (!vivo()) return listo()
        if (puedeAvanzar()) restante -= 50
        if (restante <= 0) return listo()
        setTimeout(paso, 50)
      }
      setTimeout(paso, 50)
    })
}

export function TelefonoDemo({ nombreNegocio, rubro }: TelefonoDemoProps) {
  const sinMovimiento = useReducedMotion() ?? false
  const [nombre, setNombre] = useState(nombreNegocio)
  const [vuelta, setVuelta] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [mostrados, setMostrados] = useState(0)
  const [borrador, setBorrador] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)

  const raiz = useRef<HTMLElement>(null)
  const chat = useRef<HTMLDivElement>(null)
  const enPantalla = useRef(true)
  const pausadoRef = useRef(false)

  // Mientras escriben el nombre en el formulario, la simulación no se reinicia
  // con cada letra: espera a que dejen de escribir.
  useEffect(() => {
    const t = setTimeout(() => setNombre(nombreNegocio), 500)
    return () => clearTimeout(t)
  }, [nombreNegocio])

  const mensajes = useMemo(() => simularConversacion(nombre, rubro), [nombre, rubro])

  useEffect(() => {
    pausadoRef.current = pausado
  }, [pausado])

  useEffect(() => {
    const el = raiz.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([e]) => { enPantalla.current = e.isIntersecting }, { threshold: 0.25 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (sinMovimiento) return
    let vivo = true
    const esperar = crearEspera(
      () => enPantalla.current && !pausadoRef.current && !document.hidden,
      () => vivo,
    )

    async function correr() {
      while (vivo) {
        setMostrados(0)
        setBorrador('')
        setEscribiendo(false)
        await esperar(900)
        for (let i = 0; i < mensajes.length && vivo; i++) {
          const m = mensajes[i]
          if (m.de === 'cliente') {
            // El cliente escribe en la barra, letra por letra, y envía.
            const ritmo = m.texto.length > 40 ? 22 : 36
            for (let c = 1; c <= m.texto.length && vivo; c++) {
              setBorrador(m.texto.slice(0, c))
              await esperar(ritmo)
            }
            await esperar(380)
            setBorrador('')
            setMostrados(i + 1)
            await esperar(650)
          } else {
            // El asistente "escribe" un tiempo proporcional a lo que dice.
            setEscribiendo(true)
            await esperar(Math.min(2200, 700 + m.texto.length * 12))
            setEscribiendo(false)
            setMostrados(i + 1)
            await esperar(1200)
          }
        }
        await esperar(4200)
      }
    }
    void correr()
    return () => { vivo = false }
  }, [mensajes, sinMovimiento, vuelta])

  const visibles = sinMovimiento ? mensajes.length : mostrados

  useEffect(() => {
    const el = chat.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: sinMovimiento ? 'auto' : 'smooth' })
  }, [visibles, escribiendo, sinMovimiento])

  const titulo = nombre.trim() || 'Su negocio'

  return (
    <figure ref={raiz} className="flex min-w-0 flex-col items-center gap-3" aria-label={`Simulación de WhatsApp con el asistente de ${titulo}`}>
      {/* Marco del teléfono */}
      <div
        aria-hidden="true"
        className="relative aspect-[272/560] w-[236px] shrink-0 rounded-[46px] p-[9px] sm:w-[268px]"
        style={{
          background: 'linear-gradient(145deg, #3a3d44 0%, #1b1d22 45%, #2c2f35 100%)',
          boxShadow:
            '0 0 0 1px rgb(255 255 255 / 0.08) inset, 0 1px 1px rgb(255 255 255 / 0.12) inset, 0 30px 60px -20px rgb(0 0 0 / 0.75), 0 0 0 1px rgb(0 0 0 / 0.6), 0 0 80px -30px var(--tx-accent-glow)',
        }}
      >
        {/* Botones laterales */}
        <span className="absolute -left-[3px] top-[88px] h-7 w-[3px] rounded-l bg-[#2a2d33]" />
        <span className="absolute -left-[3px] top-[128px] h-12 w-[3px] rounded-l bg-[#2a2d33]" />
        <span className="absolute -left-[3px] top-[184px] h-12 w-[3px] rounded-l bg-[#2a2d33]" />
        <span className="absolute -right-[3px] top-[140px] h-16 w-[3px] rounded-r bg-[#2a2d33]" />

        {/* Pantalla */}
        <div className="relative flex h-full flex-col overflow-hidden rounded-[37px]" style={{ background: WA.fondo, color: WA.texto }}>
          {/* Isla dinámica */}
          <span className="absolute left-1/2 top-[9px] z-20 h-[24px] w-[84px] -translate-x-1/2 rounded-full bg-black" />

          {/* Barra de estado */}
          <div className="relative z-10 flex h-[42px] shrink-0 items-center justify-between px-6 pt-1 text-[12px] font-semibold" style={{ background: WA.barra }}>
            <span className="tabular-nums">9:41</span>
            <span className="flex items-center gap-1">
              <Signal className="size-3" strokeWidth={2.5} />
              <Wifi className="size-3" strokeWidth={2.5} />
              <BatteryFull className="size-4" strokeWidth={2} />
            </span>
          </div>

          {/* Cabecera del chat */}
          <div className="flex shrink-0 items-center gap-1.5 px-1.5 pb-2 pt-0.5" style={{ background: WA.barra }}>
            <ChevronLeft className="size-5 shrink-0" style={{ color: WA.texto }} />
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, var(--tx-accent) 0%, var(--tx-accent-surface) 100%)' }}
            >
              {iniciales(titulo)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold">{titulo}</span>
              <span className="h-[14px] overflow-hidden text-[10.5px]" style={{ color: escribiendo ? WA.verde : WA.meta }}>
                {escribiendo ? 'escribiendo…' : 'en línea'}
              </span>
            </span>
            <Video className="size-[18px] shrink-0" style={{ color: WA.texto }} />
            <Phone className="mx-1 size-4 shrink-0" style={{ color: WA.texto }} />
          </div>

          {/* Conversación */}
          <div
            ref={chat}
            className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2.5 py-2.5"
            style={{
              backgroundColor: WA.fondo,
              backgroundImage:
                'radial-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px), radial-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px)',
              backgroundSize: '18px 18px, 18px 18px',
              backgroundPosition: '0 0, 9px 9px',
            }}
          >
            <span className="mx-auto mb-1 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ background: WA.barra, color: WA.meta }}>
              Hoy
            </span>
            <AnimatePresence initial={false}>
              {mensajes.slice(0, visibles).map((m, i) => {
                const propio = m.de === 'cliente'
                return (
                  <motion.div
                    key={`${vuelta}-${i}`}
                    initial={sinMovimiento ? false : { opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className={`max-w-[82%] rounded-[10px] px-2 pb-1 pt-1.5 text-[12px] leading-[1.35] shadow-sm ${propio ? 'self-end rounded-tr-[3px]' : 'self-start rounded-tl-[3px]'}`}
                    style={{ background: propio ? WA.saliente : WA.entrante, transformOrigin: propio ? 'bottom right' : 'bottom left' }}
                  >
                    <span className="[overflow-wrap:anywhere]">{m.texto}</span>
                    <span className="float-right ml-2 mt-1 inline-flex translate-y-0.5 items-center gap-0.5 text-[9.5px] tabular-nums" style={{ color: propio ? 'rgb(233 237 239 / 0.6)' : WA.meta }}>
                      {horaDe(i)}
                      {propio && <CheckCheck className="size-3.5" style={{ color: WA.visto }} />}
                    </span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            <AnimatePresence>
              {escribiendo && (
                <motion.div
                  key="escribiendo"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-1 self-start rounded-[10px] rounded-tl-[3px] px-3 py-2.5"
                  style={{ background: WA.entrante }}
                >
                  {[0, 1, 2].map((p) => (
                    <motion.span
                      key={p}
                      className="size-1.5 rounded-full"
                      style={{ background: WA.meta }}
                      animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: p * 0.15, ease: 'easeInOut' }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Barra para escribir */}
          <div className="flex shrink-0 items-end gap-1.5 px-1.5 pb-1 pt-1.5" style={{ background: WA.fondo }}>
            <div className="flex min-h-[34px] min-w-0 flex-1 items-center gap-1.5 rounded-full px-2.5" style={{ background: WA.barra }}>
              <Smile className="size-4 shrink-0" style={{ color: WA.meta }} />
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: borrador ? WA.texto : WA.meta }}>
                {borrador || 'Mensaje'}
                {borrador && <span className="ml-px inline-block h-3 w-px translate-y-0.5 animate-pulse" style={{ background: WA.verde }} />}
              </span>
              <Paperclip className="size-3.5 shrink-0" style={{ color: WA.meta }} />
              {!borrador && <Camera className="size-3.5 shrink-0" style={{ color: WA.meta }} />}
            </div>
            <span className="grid size-[34px] shrink-0 place-items-center rounded-full" style={{ background: WA.verde }}>
              {borrador ? <SendHorizontal className="size-4 text-white" /> : <Mic className="size-4 text-white" />}
            </span>
          </div>

          {/* Indicador de inicio */}
          <div className="flex h-[18px] shrink-0 items-center justify-center" style={{ background: WA.fondo }}>
            <span className="h-[4px] w-[92px] rounded-full bg-white/80" />
          </div>
        </div>
      </div>

      {/* Lo que leen los lectores de pantalla: la conversación completa, quieta. */}
      <ol className="sr-only">
        {mensajes.map((m, i) => (
          <li key={i}>{m.de === 'cliente' ? 'Cliente' : `Asistente de ${titulo}`}: {m.texto}</li>
        ))}
      </ol>

      <figcaption className="flex max-w-[268px] flex-col items-center gap-2 text-center">
        <span className="text-xs font-medium text-[var(--tx-ink-secondary)]">Así respondería el asistente de {titulo}</span>
        <span className="text-[11px] leading-snug text-[var(--tx-ink-muted)]">
          Simulación ilustrativa. En la demo real responde a lo que escriba el cliente, con las mismas reglas: no inventa precios ni confirma horas.
        </span>
        {!sinMovimiento && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPausado((p) => !p)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs text-[var(--tx-ink-secondary)] transition-colors hover:text-[var(--tx-ink-primary)]"
              style={{ border: '1px solid var(--tx-border-strong)' }}
              aria-pressed={pausado}
            >
              {pausado ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
              {pausado ? 'Reanudar' : 'Pausar'}
            </button>
            <button
              type="button"
              onClick={() => { setPausado(false); setVuelta((v) => v + 1) }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs text-[var(--tx-ink-secondary)] transition-colors hover:text-[var(--tx-ink-primary)]"
              style={{ border: '1px solid var(--tx-border-strong)' }}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Repetir
            </button>
          </span>
        )}
      </figcaption>
    </figure>
  )
}
