'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Loader2, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { Lead } from '@/lib/types/lead'

/**
 * El chat de WhatsApp del lead, DENTRO del CRM.
 *
 * Reemplaza al `window.open('https://wa.me/...')` que sacaba al equipo de la
 * plataforma. Pedido de Cristian (10-ago-2026): *"no queremos que nos mande a
 * la pagina de WhatsApp Web sino hablarle desde ahi mismo"*.
 *
 * El mensaje sale del numero de Tryvex por el puente del VPS. Este componente
 * no le habla al puente: escribe en el buzon (`POST /api/wa/send`) y el puente
 * lo pasa a buscar — el puente escucha en localhost y desde Vercel es
 * inalcanzable. Ver la migracion 041.
 */

interface MensajeWa {
  id: string
  direccion: 'in' | 'out'
  texto: string
  es_bot?: boolean | null
  enviado_por?: string | null
  estado_envio?: string | null
  created_at: string
}

/** Cada cuanto se mira si contestaron, mientras el chat esta abierto. */
const REFRESCO_MS = 5000

/** El primer mensaje, ya escrito. Editable: es un punto de partida, no un molde. */
export function textoSugerido(lead: Lead): string {
  const negocio = lead.nombre_negocio ?? 'tu negocio'
  return (
    `Hola 👋 ¿hablo con ${negocio}?\n\n` +
    `Somos Tryvex. Ayudamos a negocios como el tuyo a conseguir más clientes ` +
    `con una página web lista en días. ¿Te muestro un ejemplo, sin compromiso?`
  )
}

function hora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function LeadChatWa({ lead, onCerrar }: { lead: Lead; onCerrar?: () => void }) {
  const [mensajes, setMensajes] = useState<MensajeWa[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [redactando, setRedactando] = useState(false)
  /** Para rotular la caja: quien envía tiene que saber que ese texto lo escribió un modelo. */
  const [loEscribioVex, setLoEscribioVex] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  // La sugerencia se pone UNA vez, y solo si la conversacion esta en blanco.
  // Antes se ponia al montar el componente, sin mirar el hilo: al reabrir un
  // chat ya empezado volvia a aparecer "Hola 👋 ¿hablo con...?" encima, como si
  // fuera el primer contacto. Es un punto de partida, no un molde que se repite.
  const sugerenciaResuelta = useRef(false)
  /** Ultimo entrante ya marcado como leido, para no repetir el POST cada 5 s. */
  const ultimoLeido = useRef<string | null>(null)
  /** ¿La persona ya escribió algo? Entonces Vex no le pisa la caja. */
  const tecleoHumano = useRef(false)
  // El lead vive en un ref para que `cargar` no dependa del objeto entero: si
  // dependiera, se recrearia en cada render y el refresco se reiniciaria solo.
  const leadRef = useRef(lead)
  useEffect(() => {
    leadRef.current = lead
  }, [lead])

  /**
   * Le pide a Vex el primer mensaje para este lead y lo deja en la caja.
   *
   * Antes acá se plantaba `textoSugerido()`: tres renglones fijos, iguales para
   * los 538 leads, sin el rubro ni la comuna ni nada del negocio. Ese era el
   * texto que el equipo veía al abrir un chat, y de ahí venía el "siempre manda
   * el mismo mensaje" — el camino con IA existía, pero no era el que se usaba.
   *
   * No se envía nada: queda escrito para que una persona lo lea, lo edite si
   * quiere, y decida.
   */
  const pedirleAVex = useCallback(async () => {
    setRedactando(true)
    try {
      const r = await fetch('/api/vex/redactar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      })
      const d = await r.json().catch(() => ({}))
      // Redactar tarda unos segundos. Si en el intervalo la persona empezó a
      // escribir, su texto manda: pisárselo sería lo más molesto posible.
      if (tecleoHumano.current) return
      if (r.ok && d?.texto) {
        setTexto(d.texto)
        setLoEscribioVex(true)
        return
      }
      throw new Error(d?.error ?? `no se pudo redactar (${r.status})`)
    } catch {
      if (tecleoHumano.current) return
      // Si Vex no puede (modelo caído, sin cuota, lead sin datos), se cae al
      // texto de siempre en vez de dejar la caja vacía: tener algo editable es
      // mejor que no tener nada. Sin rótulo, porque no lo escribió Vex.
      setTexto(textoSugerido(leadRef.current))
    } finally {
      setRedactando(false)
    }
  }, [lead.id])

  const prepararCaja = useCallback(async (conversacionEnBlanco: boolean) => {
    setRedactando(true)
    try {
      // ¿Vex ya dejó uno listo desde su chat? Ese gana siempre, haya o no
      // conversación previa: es el camino de uso diario — pedirle los mensajes
      // a Vex y venir a revisarlos acá. Volver a redactar daría un texto
      // distinto del que la persona ya leyó allá.
      const guardado = await fetch(`/api/leads/${lead.id}/borrador`)
        .then((r) => r.json())
        .catch(() => null)

      if (guardado?.data?.texto) {
        if (tecleoHumano.current) return
        setTexto(guardado.data.texto)
        setLoEscribioVex(true)
        return
      }

      // Sin borrador y con conversación empezada: la respuesta la escribe una
      // persona. Un saludo de apertura en medio de un hilo no tiene sentido.
      if (!conversacionEnBlanco) return

      await pedirleAVex()
    } finally {
      setRedactando(false)
    }
  }, [lead.id, pedirleAVex])

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${lead.id}/mensajes`)
      if (!r.ok) return
      const d = await r.json()
      const lista: MensajeWa[] = d.data ?? []
      setMensajes(lista)

      // Si el chat esta abierto, lo entrante esta siendo leido. Se marca cada
      // vez que llega algo nuevo (no solo al abrir): si alguien deja la ficha
      // abierta y el cliente escribe, no tiene sentido que le quede el aviso.
      const ultimoEntrante = lista.filter((m) => m.direccion === 'in').at(-1)
      if (ultimoEntrante && ultimoEntrante.id !== ultimoLeido.current) {
        ultimoLeido.current = ultimoEntrante.id
        fetch('/api/wa/leido', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: lead.id }),
          // Falla en silencio: no poder marcar leido no puede romperle el chat
          // a nadie, y el proximo refresco lo reintenta igual.
        }).catch(() => {})
      }

      if (!sugerenciaResuelta.current) {
        sugerenciaResuelta.current = true
        // Qué se ofrece en la caja, por orden de prioridad:
        //   1. El borrador que Vex dejó desde su chat — con o sin conversación
        //      previa. Es el caso de "pedile otro para este mismo cliente".
        //   2. Si no hay borrador y la conversación está en blanco, se le pide
        //      a Vex el primer mensaje para ese negocio.
        //   3. Si ya hay conversación y nadie dejó borrador, caja vacía: la
        //      respuesta la escribe una persona.
        prepararCaja(lista.length === 0)
      }
    } catch {
      // Sin conexión no se avisa cada 5 segundos: sería ruido, no información.
    } finally {
      setCargando(false)
    }
    // Solo el id (y `prepararCaja`, que a su vez solo depende del id): con el
    // objeto `lead` entero, esto se recrearia en cada render del panel y el
    // refresco de 5 s se reiniciaria solo, sin dispararse nunca.
  }, [lead.id, prepararCaja])

  // Se refresca solo mientras el chat está abierto, y se corta al cerrarlo:
  // un sondeo que sigue vivo detrás de una pantalla cerrada es gasto puro.
  useEffect(() => {
    // `cargar` es async: en este tick solo arranca el fetch, y el setState
    // pasa recien cuando responde. La regla no puede ver a traves del await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar()
    const t = setInterval(cargar, REFRESCO_MS)
    return () => clearInterval(t)
  }, [cargar])

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [mensajes.length])

  async function enviar() {
    const limpio = texto.trim()
    if (!limpio || enviando) return
    setEnviando(true)
    try {
      const r = await fetch('/api/wa/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id, texto: limpio, enviado_por: 'Equipo' }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `no se pudo enviar (${r.status})`)
      setTexto('')
      setLoEscribioVex(false)
      // El borrador ya cumplio: si queda guardado, reaparece la proxima vez que
      // se abra el chat, encima de una conversacion que ya siguio.
      fetch(`/api/leads/${lead.id}/borrador`, { method: 'DELETE' }).catch(() => {})
      toast.success('Mensaje encolado — sale en unos segundos')
      cargar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    // Columna de altura completa: cabecera fija arriba, hilo elastico al medio,
    // caja de texto fija abajo. Antes el hilo tenia una altura tope y el
    // conjunto crecia hacia abajo dentro del panel; en un celular eso dejaba la
    // caja de texto fuera de la pantalla y el chat quedaba de solo lectura.
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-1 pb-2.5 border-b border-white/[0.06] flex items-center gap-2 shrink-0">
        <MessageCircleIcon />
        <span className="text-[13px] font-medium text-[var(--tx-ink)] truncate min-w-0">
          {lead.nombre_negocio ?? 'este lead'}
        </span>
        <span className="ml-auto text-[11px] text-[var(--tx-ink-muted)] shrink-0 hidden sm:inline">
          sale del número de Tryvex
        </span>
        {onCerrar && (
          // 44x44 reales: es el minimo que una mano toca sin errarle. El icono
          // se ve de 18, pero el area que responde es la del cuadrado entero.
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el chat"
            className="ml-auto sm:ml-2 shrink-0 grid place-items-center w-11 h-11 -my-2 -mr-2 rounded-xl text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink)] hover:bg-white/[0.06] transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* El hilo: es lo unico que hace scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1 py-3 flex flex-col gap-2">
        {cargando && (
          <p className="text-[12px] text-[var(--tx-ink-muted)]">Cargando…</p>
        )}
        {!cargando && mensajes.length === 0 && (
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            Todavía no hay mensajes. El primero que mandes aparece acá.
          </p>
        )}
        {mensajes.map((m) => {
          const mio = m.direccion === 'out'
          const quien = mio ? (m.es_bot ? 'Vex' : m.enviado_por || 'Equipo') : (lead.nombre_negocio ?? 'Lead')
          return (
            <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                  mio
                    ? 'bg-green-500/15 border border-green-500/20 text-[var(--tx-ink)]'
                    : 'bg-white/[0.05] border border-white/[0.06] text-[var(--tx-ink)]'
                }`}
              >
                {m.texto}
                <div className="mt-1 text-[10px] text-[var(--tx-ink-muted)]">
                  {quien} · {hora(m.created_at)}
                  {mio && m.estado_envio ? ` · ${m.estado_envio}` : ''}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={finRef} />
      </div>

      {/* Escribir: pegado abajo, nunca se va de la pantalla */}
      {(redactando || loEscribioVex) && (
        <div className="px-1 pt-2 flex items-center gap-1.5 text-[11px] text-[var(--tx-ink-muted)] shrink-0">
          {redactando ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              Vex está escribiendo el mensaje para este negocio…
            </>
          ) : (
            // El rótulo no es decorativo: quien aprieta enviar tiene que saber
            // que ese texto lo escribió un modelo y conviene leerlo antes.
            <>✨ Lo escribió Vex — léelo antes de enviar</>
          )}
        </div>
      )}

      <div className="border-t border-white/[0.06] pt-3 px-1 flex gap-2 items-end shrink-0">
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            tecleoHumano.current = true
            // Editado por una persona: ya no es "lo escribió Vex" tal cual.
            setLoEscribioVex(false)
          }}
          onKeyDown={(e) => {
            // Enter manda, Shift+Enter hace un salto de linea: lo que espera
            // cualquiera que haya usado un chat.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              enviar()
            }
          }}
          rows={3}
          placeholder="Escribí el mensaje…"
          className="flex-1 resize-none rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-[13px] text-[var(--tx-ink)] outline-none focus:border-green-500/30 placeholder:text-[var(--tx-ink-muted)]"
        />
        <button
          onClick={enviar}
          disabled={!texto.trim() || enviando}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-medium border border-green-500/20 bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors disabled:opacity-40"
        >
          {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}

function MessageCircleIcon() {
  return (
    <span className="text-green-400" aria-hidden>
      💬
    </span>
  )
}
