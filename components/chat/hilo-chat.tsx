'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, Loader2Icon, PaperclipIcon, PhoneIcon, PinIcon, SendIcon, VideoIcon, XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { textoPlano } from '@/lib/markdown/mini'
import { copiarTexto } from '@/lib/utils/copiar-texto'
import { toast } from '@/lib/toast'
import type { Conversacion, Mensaje, MiembroChat } from '@/lib/types/chat'
import { avatarConversacion, pesoLegible, tituloConversacion } from '@/lib/types/chat'
import { MAX_ARCHIVOS, validarArchivos } from '@/lib/types/adjuntos'
import { subirAdjuntos, leerJSON, type AdjuntoSubido } from '@/lib/chat/subir-adjuntos'
import {
  PRESENCIA_LABEL,
  detallePresencia,
  estadoVisible,
  type PresenciaIntegrante,
} from '@/lib/types/presencia'
import { Markdown } from '@/components/shared/markdown'
import { AvatarChat } from './avatar-chat'
import { AdjuntosMensaje } from './adjuntos-mensaje'
import { AccionesMensaje } from './acciones-mensaje'
import { ReaccionesMensaje } from './reacciones-mensaje'
import { GestosMensaje } from './gestos-mensaje'
import { CitaMensaje } from './cita-mensaje'
import { PanelHilo } from './panel-hilo'
import { useLlamadas } from '@/components/llamadas/proveedor-llamadas'
import type { AgenteChat } from './chat-workspace'

interface HiloChatProps {
  conversacion: Conversacion
  miIntegranteId: string
  enLinea: Set<string>
  disponibilidad: Map<string, PresenciaIntegrante>
  agentes?: AgenteChat[]
  /** Habilita eliminar cualquier mensaje, no solo el propio. */
  soyAdmin?: boolean
  onMensajeEnviado?: (mensaje: Mensaje) => void
  /** Vuelve a la bandeja. Solo se ve en móvil, donde el hilo ocupa la pantalla. */
  onVolver?: () => void
}


const HORA = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Santiago',
})

export function HiloChat({
  conversacion,
  miIntegranteId,
  enLinea,
  disponibilidad,
  agentes = [],
  soyAdmin = false,
  onMensajeEnviado,
  onVolver,
}: HiloChatProps) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Cuántos adjuntos van subidos. Sin esto, mandar un archivo grande se ve
  // igual que mandar texto: la persona no sabe si está pasando algo o se colgó.
  const [subiendo, setSubiendo] = useState<{ hechos: number; total: number } | null>(null)
  const [porEnviar, setPorEnviar] = useState<File[]>([])
  const [citando, setCitando] = useState<Mensaje | null>(null)
  const [hiloAbierto, setHiloAbierto] = useState<Mensaje | null>(null)
  const [cargando, setCargando] = useState(true)
  const [fijados, setFijados] = useState<Mensaje[]>([])
  const [fijadosAbiertos, setFijadosAbiertos] = useState(false)
  const finRef = useRef<HTMLDivElement>(null)
  const cajaRef = useRef<HTMLTextAreaElement>(null)
  // Clicks repetidos en la misma píldora antes de que responda el servidor
  // disparaban dos POST concurrentes: el toggle del servidor es leer-y-actuar,
  // no atómico, así que el segundo veía el mismo estado que el primero y
  // llegaba tarde a la DB -- 403. Se bloquea acá, no en el servidor.
  const reaccionesEnVuelo = useRef<Set<string>>(new Set())
  const archivosRef = useRef<HTMLInputElement>(null)

  const { llamar, conversacionActiva } = useLlamadas()
  const hayLlamadaAca = conversacionActiva === conversacion.id

  const porId = new Map<string, MiembroChat>(conversacion.miembros.map((m) => [m.integrante_id, m]))
  const agentePorId = new Map(agentes.map((a) => [a.id, a]))
  const titulo = tituloConversacion(conversacion, miIntegranteId)
  const otro = conversacion.miembros.find((m) => m.integrante_id !== miIntegranteId)
  const presenciaOtro = otro ? disponibilidad.get(otro.integrante_id) : undefined
  const estadoOtro = otro ? estadoVisible(presenciaOtro, enLinea.has(otro.integrante_id)) : undefined

  // Historial al abrir el hilo.
  useEffect(() => {
    let vigente = true

    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vigente) return
        if (json.success) setMensajes(json.data as Mensaje[])
        else toast.error(json.error ?? 'No se pudieron cargar los mensajes')
      })
      .catch(() => vigente && toast.error('Error de red al cargar el chat'))
      .finally(() => vigente && setCargando(false))

    return () => {
      vigente = false
    }
  }, [conversacion.id])

  /**
   * Los fijados van en su propia consulta y no se derivan de `mensajes`: lo fijado
   * suele ser viejo —el link del deploy, el acuerdo de la semana pasada— y quedaría
   * fuera de los últimos 100 mensajes que carga el hilo. Justo lo que se quiere tener
   * a mano es lo que ya no está a la vista.
   *
   * Se saca a una función aparte (`useCallback`) porque el canal de realtime de más
   * abajo también necesita volver a pedirla cuando alguien fija o suelta un mensaje
   * desde otra pestaña.
   */
  const cargarFijados = useCallback(() => {
    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}&fijados=1`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setFijados(json.data as Mensaje[])
      })
      // Sin fijados el chat funciona igual: no vale un toast de error.
      .catch(() => {})
  }, [conversacion.id])

  useEffect(() => {
    cargarFijados()
  }, [cargarFijados])

  // IDs de los mensajes cargados, para que el canal de reacciones (que no puede
  // filtrar por conversacion_id porque la tabla no tiene esa columna) sepa si un
  // evento le importa sin tener que volver a pedir todo por las dudas.
  const idsMensajesRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    idsMensajesRef.current = new Set(mensajes.map((m) => m.id))
  }, [mensajes])

  /**
   * Trae de nuevo el historial completo (reacciones ya agrupadas y con nombres,
   * como las arma el servidor) sin tocar `cargando`, para no parpadear el spinner
   * por un cambio que llegó de otra pestaña o de otra persona.
   */
  const refrescarMensajes = useCallback(() => {
    fetch(`/api/chat/mensajes?conversacion=${conversacion.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setMensajes(json.data as Mensaje[])
      })
      .catch(() => {})
  }, [conversacion.id])

  // Mensajes nuevos, fijados/soltados y reacciones en vivo, sin recargar.
  //
  // `mensaje_reacciones` no tiene `conversacion_id`: filtrar por él en el canal no es
  // posible, así que se escucha sin filtro y se descarta acá lo que no es de este
  // hilo. `mensajes` publica la fila entera (REPLICA IDENTITY FULL, migración 023),
  // así que un UPDATE trae también `fijado_at`/`fijado_por` ya resueltos.
  useEffect(() => {
    const supabase = createClient()
    const canal = supabase
      .channel(`mensajes-${conversacion.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const nuevo = payload.new as Mensaje
          // El propio ya se agregó al enviar: no duplicarlo.
          setMensajes((previos) => (previos.some((m) => m.id === nuevo.id) ? previos : [...previos, nuevo]))
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensajes',
          filter: `conversacion_id=eq.${conversacion.id}`,
        },
        (payload) => {
          const actualizado = payload.new as Mensaje
          setMensajes((previos) =>
            previos.map((m) =>
              m.id === actualizado.id
                ? { ...m, fijado_at: actualizado.fijado_at, fijado_por: actualizado.fijado_por }
                : m,
            ),
          )
          cargarFijados()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensaje_reacciones' },
        (payload) => {
          const fila = payload.new as { mensaje_id: string }
          if (idsMensajesRef.current.has(fila.mensaje_id)) refrescarMensajes()
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'mensaje_reacciones' },
        (payload) => {
          const fila = payload.old as { mensaje_id?: string }
          if (fila.mensaje_id && idsMensajesRef.current.has(fila.mensaje_id)) refrescarMensajes()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canal)
    }
  }, [conversacion.id, cargarFijados, refrescarMensajes])

  // Qué mensajes deben animar de entrada: el historial completo no anima al
  // abrir el hilo (se vería como si el chat entero se desplegara mensaje por
  // mensaje). Solo lo que llega después de esa foto inicial —enviado o
  // recibido en vivo— desliza. Se resuelve en un efecto, no durante el
  // render, porque leer/escribir un ref ahí rompe las garantías de React.
  const [animarIds, setAnimarIds] = useState<Set<string>>(new Set())
  const vistosRef = useRef<Set<string>>(new Set())
  const historialListoRef = useRef(false)
  useEffect(() => {
    if (!cargando && !historialListoRef.current) {
      mensajes.forEach((m) => vistosRef.current.add(m.id))
      historialListoRef.current = true
      return
    }
    if (!historialListoRef.current) return
    const nuevos = mensajes.filter((m) => !vistosRef.current.has(m.id))
    if (nuevos.length === 0) return
    nuevos.forEach((m) => vistosRef.current.add(m.id))
    setAnimarIds((previos) => {
      const siguiente = new Set(previos)
      nuevos.forEach((m) => siguiente.add(m.id))
      return siguiente
    })
  }, [cargando, mensajes])

  // Saltar instantaneo la primera vez (abrir el hilo no deberia verse como si
  // barriera la pantalla de arriba a abajo animando todo el historial), y
  // recien de ahi en mas usar scroll suave para los mensajes nuevos en vivo.
  const primerScrollRef = useRef(true)
  useEffect(() => {
    if (mensajes.length === 0) return
    finRef.current?.scrollIntoView({ behavior: primerScrollRef.current ? 'auto' : 'smooth' })
    primerScrollRef.current = false
  }, [mensajes.length])

  /**
   * La caja crece con el texto. Con `rows={1}` fijo, un Shift+Enter metía el salto
   * pero la altura no cambiaba: la línea nueva empujaba a la anterior fuera de
   * vista y parecía que el texto desaparecía.
   *
   * Se baja a 'auto' antes de medir porque scrollHeight nunca decrece por sí solo:
   * sin eso la caja crecería y no volvería a achicarse al borrar.
   */
  useEffect(() => {
    const caja = cajaRef.current
    if (!caja) return
    caja.style.height = 'auto'
    caja.style.height = `${caja.scrollHeight}px`
  }, [borrador])

  const enviar = async () => {
    const contenido = borrador.trim()
    // Una foto sola ya es un mensaje: no hace falta escribir nada.
    if ((!contenido && porEnviar.length === 0) || enviando) return

    setEnviando(true)
    try {
      // Los archivos suben DIRECTO a Storage y después se manda el mensaje con
      // las rutas. Antes iban dentro del propio POST como FormData, y eso los
      // hacía pasar por la función de Vercel, que corta a los 4,5 MB: el chat
      // parecía roto cuando en realidad estaba topando un límite invisible.
      let adjuntos: AdjuntoSubido[] = []
      if (porEnviar.length > 0) {
        setSubiendo({ hechos: 0, total: porEnviar.length })
        adjuntos = await subirAdjuntos(conversacion.id, porEnviar, (hechos, total) =>
          setSubiendo({ hechos, total }),
        )
      }

      const res = await fetch('/api/chat/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacion_id: conversacion.id,
          contenido: contenido || undefined,
          responder_a: citando?.id,
          adjuntos: adjuntos.length > 0 ? adjuntos : undefined,
        }),
      })

      const json = await leerJSON(res)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? 'No se pudo enviar')

      const mensaje = json.data as Mensaje
      setMensajes((previos) => (previos.some((m) => m.id === mensaje.id) ? previos : [...previos, mensaje]))
      setBorrador('')
      setPorEnviar([])
      setCitando(null)
      onMensajeEnviado?.(mensaje)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error enviando el mensaje')
    } finally {
      setEnviando(false)
      setSubiendo(null)
    }
  }

  /**
   * Pone o saca un emoji.
   *
   * Se pinta antes de que responda el servidor: una reacción que tarda medio segundo
   * en aparecer se siente rota, y es la interacción más liviana del chat. Si el POST
   * falla, se revierte y se avisa.
   *
   * El servidor devuelve `puesta` con el estado FINAL y esa es la verdad, no lo que
   * adivinó el optimismo de acá. Antes se descartaba: si el cliente creía estar
   * quitando y el servidor terminaba dejando la reacción puesta, la píldora
   * desaparecía de la pantalla, nadie se enteraba, y al recargar seguía ahí. Un
   * desacuerdo silencioso entre cliente y servidor es indiagnosticable: si el
   * resultado no fue el que se pintó, hay que volver atrás y decirlo.
   */
  const alternarReaccion = async (mensaje: Mensaje, emoji: string) => {
    const clave = `${mensaje.id}:${emoji}`
    if (reaccionesEnVuelo.current.has(clave)) return
    reaccionesEnVuelo.current.add(clave)

    // El popover lista nombres reales que vienen del servidor (join con
    // dim_integrantes) -- nunca dice "Tú". Filtrar por ese string literal no
    // encontraba nada al sacar la reacción y el nombre propio quedaba pegado
    // en la lista para siempre.
    const miNombre = porId.get(miIntegranteId)?.nombre ?? 'Tú'

    // Lo que el usuario quiso hacer, leído de la píldora que efectivamente tocó.
    const queriaPoner = !(mensaje.reacciones ?? []).find((r) => r.emoji === emoji)?.mia

    const aplicar = (lista: Mensaje[], invertir: boolean) =>
      lista.map((m) => {
        if (m.id !== mensaje.id) return m

        const actuales = m.reacciones ?? []
        const existente = actuales.find((r) => r.emoji === emoji)
        const mia = existente?.mia ?? false
        const suma = invertir ? (mia ? 1 : -1) : mia ? -1 : 1

        // Quitar la última reacción de un emoji borra la píldora entera.
        if (existente && existente.cuenta + suma <= 0) {
          return { ...m, reacciones: actuales.filter((r) => r.emoji !== emoji) }
        }

        if (!existente) {
          return {
            ...m,
            reacciones: [...actuales, { emoji, cuenta: 1, mia: true, quienes: [miNombre] }],
          }
        }

        return {
          ...m,
          reacciones: actuales.map((r) => {
            if (r.emoji !== emoji) return r
            const yoAhora = !r.mia
            return {
              ...r,
              cuenta: r.cuenta + suma,
              mia: yoAhora,
              // El contador solo no alcanza: si "Tú" entra o sale, la lista de
              // nombres del popover tiene que moverse con él o queda mintiendo
              // sobre quién reaccionó.
              quienes: yoAhora ? [...r.quienes, miNombre] : r.quienes.filter((n) => n !== miNombre),
            }
          }),
        }
      })

    setMensajes((previos) => aplicar(previos, false))

    try {
      const res = await fetch(`/api/chat/mensajes/${mensaje.id}/reacciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo reaccionar')

      // El servidor es un interruptor y decide él: si su estado final no coincide
      // con el que se pintó, gana el suyo. Se revierte y se avisa en vez de dejar
      // la pantalla mintiendo hasta la próxima recarga.
      const puesta = (json.data as { puesta?: boolean } | undefined)?.puesta
      if (typeof puesta === 'boolean' && puesta !== queriaPoner) {
        setMensajes((previos) => aplicar(previos, true))
        toast.error(
          puesta
            ? 'No se pudo quitar la reacción: sigue puesta.'
            : 'No se pudo poner la reacción.',
        )
      }
    } catch (err) {
      setMensajes((previos) => aplicar(previos, true))
      toast.error(err instanceof Error ? err.message : 'Error al reaccionar')
    } finally {
      reaccionesEnVuelo.current.delete(clave)
    }
  }

  /** Fija o suelta un mensaje para toda la conversación, no solo para quien mira. */
  const alternarFijado = async (mensaje: Mensaje) => {
    const fijar = !mensaje.fijado_at
    const marca = fijar ? new Date().toISOString() : null

    setMensajes((previos) =>
      previos.map((m) => (m.id === mensaje.id ? { ...m, fijado_at: marca } : m)),
    )
    // La barra del tope se actualiza en el mismo gesto: si esperara al servidor,
    // el mensaje quedaría marcado como fijado sin aparecer arriba.
    setFijados((previos) =>
      fijar
        ? [{ ...mensaje, fijado_at: marca }, ...previos.filter((f) => f.id !== mensaje.id)]
        : previos.filter((f) => f.id !== mensaje.id),
    )

    try {
      const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fijar }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo fijar')
      toast.success(fijar ? 'Mensaje fijado' : 'Ya no está fijado')
    } catch (err) {
      setMensajes((previos) =>
        previos.map((m) => (m.id === mensaje.id ? { ...m, fijado_at: mensaje.fijado_at } : m)),
      )
      setFijados((previos) =>
        fijar
          ? previos.filter((f) => f.id !== mensaje.id)
          : [mensaje, ...previos.filter((f) => f.id !== mensaje.id)],
      )
      toast.error(err instanceof Error ? err.message : 'Error al fijar')
    }
  }

  /**
   * Copiar un mensaje, para la barra de puntero y para el menú táctil.
   *
   * Una sola función para los dos: son la misma acción vista en dos
   * dispositivos, y separarlas garantizaba que una de las dos se quedara atrás.
   *
   * Devuelve `undefined` cuando no hay texto —un adjunto sin pie— para que la
   * opción ni se ofrezca.
   *
   * Va por `copiarTexto` y no por `navigator.clipboard` a secas: fuera de
   * contexto seguro (un teléfono entrando por IP de red local) esa API es
   * `undefined`, y lanzar el aviso de éxito sin esperar al resultado hacía que
   * dijera "Mensaje copiado" cuando no se había copiado nada.
   */
  const copiarMensaje = (m: { contenido: string | null }) =>
    m.contenido
      ? () => void copiarTexto(textoPlano(m.contenido!), 'Mensaje copiado')
      : undefined

  const borrar = async (mensaje: Mensaje) => {
    if (!confirm('Se elimina para todos y no se puede deshacer.')) return
    try {
      const res = await fetch(`/api/chat/mensajes/${mensaje.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo eliminar')
      // Borrado suave: la fila sigue ahi (y sus respuestas de hilo tambien),
      // solo se marca eliminado_at. Se refleja localmente sin esperar al realtime.
      setMensajes((previos) =>
        previos.map((m) =>
          m.id === mensaje.id ? { ...m, eliminado_at: new Date().toISOString(), contenido: '[mensaje eliminado]' } : m,
        ),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error eliminando el mensaje')
    }
  }

  const sumarArchivos = (nuevos: FileList | null) => {
    if (!nuevos?.length) return
    // Se avisa ACA, no al enviar: hasta el 21-ago-2026 el limite solo existia
    // en el servidor, asi que la pantalla aceptaba un archivo de 20 MB sin
    // decir nada y el error llegaba despues de que la persona ya esperaba.
    const candidatos = Array.from(nuevos)
    const problema = validarArchivos(
      [...porEnviar, ...candidatos].map((f) => ({ nombre: f.name, bytes: f.size })),
    )
    if (problema) {
      toast.error(problema)
      return
    }
    setPorEnviar((previos) => [...previos, ...candidatos].slice(0, MAX_ARCHIVOS))
  }

  return (
    <div className="flex h-full min-h-0 w-full">
    <div className="flex flex-col h-full min-h-0 flex-1 min-w-0">
      <header className="flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-[var(--border)] shrink-0">
        {onVolver && (
          <button
            onClick={onVolver}
            aria-label="Volver a la bandeja"
            className="md:hidden -ml-1 p-1 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
        )}
        <AvatarChat
          nombre={titulo}
          avatarUrl={avatarConversacion(conversacion, miIntegranteId).url}
          color={avatarConversacion(conversacion, miIntegranteId).color}
          estado={conversacion.tipo === 'dm' ? estadoOtro : undefined}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[var(--tx-ink-primary)] truncate">{titulo}</p>
          <p className="text-[12px] text-[var(--tx-ink-muted)]">
            {conversacion.tipo !== 'dm'
              ? `${conversacion.miembros.length} integrantes`
              : (detallePresencia(presenciaOtro) ??
                 (estadoOtro ? PRESENCIA_LABEL[estadoOtro] : 'Sin datos'))}
          </p>
        </div>

        {/* Llamar. En el canal de agentes no va: no hay nadie del otro lado que
            pueda contestar. */}
        {conversacion.tipo !== 'agentes' && (
          <div className="flex items-center gap-1 shrink-0">
            <BotonLlamar
              etiqueta={hayLlamadaAca ? 'Unirse a la llamada' : 'Llamar por voz'}
              destacado={hayLlamadaAca}
              onClick={() => llamar(conversacion.id, { titulo })}
            >
              <PhoneIcon className="size-5" />
            </BotonLlamar>
            <BotonLlamar
              etiqueta="Videollamada"
              onClick={() => llamar(conversacion.id, { conVideo: true, titulo })}
            >
              <VideoIcon className="size-5" />
            </BotonLlamar>
          </div>
        )}

        {/* En desktop la bandeja ya esta al lado, pero antes no habia forma
            de "soltar" la conversacion activa: una vez abierta, quedaba
            atrapado viendo siempre alguna. El mobile ya tiene la flecha de
            volver; esto es lo mismo para desktop. */}
        {onVolver && (
          <button
            onClick={onVolver}
            aria-label="Cerrar conversación"
            className="hidden md:flex shrink-0 p-1.5 rounded-lg text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] hover:bg-[var(--tx-surface-2)]"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </header>

      {/* Fijados: lo que hay que tener a mano sin buscarlo. Se muestra el más
          reciente y, si hay más, se despliegan. Mostrarlos todos siempre le comería
          media pantalla al hilo, que es lo que uno vino a leer. */}
      {fijados.length > 0 && (
        <div className="shrink-0 border-b border-[var(--border)] bg-[oklch(100%_0_0_/_3%)] px-3 sm:px-5 py-2">
          <button
            onClick={() => setFijadosAbiertos((v) => !v)}
            aria-expanded={fijadosAbiertos}
            className="flex w-full items-center gap-2 text-left"
          >
            <PinIcon className="size-3 shrink-0 text-[var(--tx-ink-muted)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--tx-ink-muted)]">
              {fijadosAbiertos
                ? `${fijados.length} ${fijados.length === 1 ? 'mensaje fijado' : 'mensajes fijados'}`
                : (fijados[0].contenido ?? 'Adjunto')}
            </span>
            {fijados.length > 1 && (
              <span className="shrink-0 text-[11px] text-[var(--tx-ink-muted)]">
                {fijadosAbiertos ? 'ocultar' : `+${fijados.length - 1}`}
              </span>
            )}
          </button>

          {fijadosAbiertos && (
            <ul className="mt-2 space-y-1.5">
              {fijados.map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[12px] text-[var(--tx-ink-primary)]">
                    {f.contenido ?? 'Adjunto'}
                  </span>
                  <button
                    onClick={() => alternarFijado(f)}
                    className="shrink-0 text-[11px] text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
                  >
                    quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* El justify-end que anclaba los mensajes cortos al fondo iba antes
          en ESTE div, el que scrollea -- y `overflow-y-auto` + `justify-end`
          en el mismo elemento es un problema conocido de flexbox: el
          navegador no deja scrollear bien hacia arriba, la barra no
          refleja el rango real. Ahora este div vuelve a ser un bloque
          normal (scroll de toda la vida) y el `justify-end` se movio al
          wrapper de ADENTRO, que no es el que scrollea. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-5 pt-4 pb-2">
      <div className="min-h-full flex flex-col justify-end space-y-2">
        {cargando ? (
          // Centrado en su propio alto completo: el padre esta en justify-end
          // por lo del hueco de abajo, y un texto suelto ahi se hubiera ido
          // pegado al fondo en vez de quedar en el medio de la pantalla.
          <div className="h-full flex items-center justify-center">
            <Loader2Icon size={20} className="animate-spin text-[var(--tx-ink-muted)]" />
          </div>
        ) : mensajes.length === 0 ? (
          <p className="text-sm text-[var(--tx-ink-muted)]">
            Todavía no hay mensajes. Escribe el primero.
          </p>
        ) : (
          mensajes.map((m, i) => {
            const mio = m.autor_id === miIntegranteId
            // Un mensaje lo escribe una persona O un agente, nunca los dos: el
            // constraint de la 024 lo garantiza en la base.
            const agente = m.agente_id ? agentePorId.get(m.agente_id) : undefined
            const persona = m.autor_id ? porId.get(m.autor_id) : undefined
            const autor = agente
              ? { nombre: agente.nombre, avatar_url: agente.avatar_url, color: agente.color }
              : persona
            const previo = mensajes[i - 1]
            const encadenado =
              i > 0 && previo.autor_id === m.autor_id && previo.agente_id === m.agente_id

            const esNuevo = animarIds.has(m.id)
            const claseEntrada = esNuevo
              ? mio
                ? 'animate-in slide-in-from-right-6 fade-in duration-300'
                : 'animate-in slide-in-from-left-6 fade-in duration-300'
              : ''

            return (
              <GestosMensaje
                key={m.id}
                puedeBorrar={mio || soyAdmin}
                onCopiar={copiarMensaje(m)}
                fijado={Boolean(m.fijado_at)}
                onResponder={() => setCitando(m)}
                onAbrirHilo={() => setHiloAbierto(m)}
                onBorrar={() => borrar(m)}
                onReaccionar={(emoji) => alternarReaccion(m, emoji)}
                onFijar={() => alternarFijado(m)}
              >
              <div className={`flex gap-2 min-w-0 ${mio ? 'justify-end' : 'justify-start'} ${claseEntrada}`}>
                {/* La foto va en todos los hilos, no solo en grupos: es la cara de
                    quien habla y en un DM también se quiere ver. El hueco de 28px
                    mantiene alineadas las burbujas encadenadas. */}
                {!mio && (
                  <div className="w-7 shrink-0">
                    {!encadenado && (
                      <AvatarChat
                        nombre={autor?.nombre ?? '?'}
                        avatarUrl={autor?.avatar_url}
                        color={autor?.color}
                        size={28}
                      />
                    )}
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[68%] min-w-0 ${mio ? 'items-end' : 'items-start'} flex flex-col group`}>
                  {!mio && conversacion.tipo !== 'dm' && !encadenado && (
                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--tx-ink-muted)] px-1 mb-0.5">
                      {autor?.nombre ?? 'Sin nombre'}
                      {/* Saber si habla una persona o un agente cambia cómo se lee
                          el mensaje. No es decoración. */}
                      {agente && (
                        <span
                          className="rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: 'var(--tx-accent-subtle)', color: 'var(--tx-ink-primary)' }}
                        >
                          agente
                        </span>
                      )}
                    </span>
                  )}
                  <div
                    className="px-3.5 py-2 text-[14px] leading-snug break-words max-w-full overflow-hidden"
                    style={{
                      borderRadius: 18,
                      background: mio ? 'var(--tx-accent)' : 'rgba(255,255,255,0.06)',
                      color: mio ? 'var(--tx-accent-fg)' : 'var(--tx-ink-primary)',
                    }}
                  >
                    {m.responder_a && (
                      <CitaMensaje
                        citado={mensajes.find((x) => x.id === m.responder_a)}
                        autor={(() => {
                          const c = mensajes.find((x) => x.id === m.responder_a)
                          return c?.autor_id ? porId.get(c.autor_id) : undefined
                        })()}
                      />
                    )}
                    {m.adjuntos && m.adjuntos.length > 0 && (
                      <div className={m.contenido ? 'mb-1.5' : ''}>
                        <AdjuntosMensaje adjuntos={m.adjuntos} />
                      </div>
                    )}
                    {/* heredaColor: el mensaje propio va sobre el acento y el markdown
                        no puede imponer el suyo o quedaría ilegible. */}
                    {m.eliminado_at ? (
                      <span className="text-[13px] italic opacity-60">Mensaje eliminado</span>
                    ) : (
                      m.contenido && (
                        <Markdown chat heredaColor className="text-[14px]">
                          {m.contenido}
                        </Markdown>
                      )
                    )}
                  </div>
                  {(m.respuestas ?? 0) > 0 && (
                    <button
                      onClick={() => setHiloAbierto(m)}
                      className="mt-1 text-[11px] font-medium text-[var(--tx-accent-2)] hover:underline"
                    >
                      {m.respuestas} {m.respuestas === 1 ? 'respuesta' : 'respuestas'}
                    </button>
                  )}

                  {/* Las reacciones sí se ven y se tocan en el teléfono: son el
                      camino corto para responder sin escribir. */}
                  <ReaccionesMensaje
                    reacciones={m.reacciones ?? []}
                    onAlternar={(emoji) => alternarReaccion(m, emoji)}
                  />

                  {/* Propio: hora pegada al borde derecho (junto a la burbuja), acciones
                      hacia la izquierda. Ajeno: al revés — hora a la izquierda, acciones
                      a la derecha. Mismo orden de DOM en los dos casos; se invierte solo
                      la dirección del flex. */}
                  <div className={`flex items-center gap-1.5 mt-0.5 ${mio ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-[var(--tx-ink-muted)] px-1">
                      {HORA.format(new Date(m.created_at))}
                    </span>
                    {m.fijado_at && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] text-[var(--tx-ink-muted)]"
                        title="Fijado en la conversación"
                      >
                        <PinIcon className="size-2.5" aria-hidden />
                        fijado
                      </span>
                    )}
                    {/* Solo donde hay hover real: en táctil se usa deslizar o
                        mantener presionado. El corte va por tipo de puntero, no
                        por ancho — un notebook táctil es ancho y no tiene hover. */}
                    <span className="solo-puntero-fino">
                      <AccionesMensaje
                        puedeBorrar={mio || soyAdmin}
                        fijado={Boolean(m.fijado_at)}
                        onResponder={() => setCitando(m)}
                        onAbrirHilo={() => setHiloAbierto(m)}
                        onBorrar={() => borrar(m)}
                        onReaccionar={(emoji) => alternarReaccion(m, emoji)}
                        onFijar={() => alternarFijado(m)}
                        onCopiar={copiarMensaje(m)}
                      />
                    </span>
                  </div>
                </div>
              </div>
              </GestosMensaje>
            )
          })
        )}
        <div ref={finRef} />
      </div>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        {citando && (
          <div
            className="flex items-start gap-2 mb-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <div className="min-w-0 flex-1 text-[var(--tx-ink-primary)]">
              <CitaMensaje
                citado={citando}
                autor={citando.autor_id ? porId.get(citando.autor_id) : undefined}
                recortar={false}
              />
            </div>
            <button
              onClick={() => setCitando(null)}
              aria-label="Cancelar respuesta"
              className="shrink-0 p-0.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)]"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        )}

        {porEnviar.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {porEnviar.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-lg pl-2.5 pr-1.5 py-1 text-[12px]"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <span className="max-w-[160px] truncate text-[var(--tx-ink-primary)]">{f.name}</span>
                <span className="text-[var(--tx-ink-muted)]">{pesoLegible(f.size)}</span>
                <button
                  onClick={() => setPorEnviar((previos) => previos.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${f.name}`}
                  className="text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] p-0.5"
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          className="flex items-end gap-2 rounded-3xl px-3 sm:px-4 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => archivosRef.current?.click()}
            disabled={enviando}
            aria-label="Adjuntar archivo"
            className="shrink-0 self-end pb-0.5 text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] disabled:opacity-40"
          >
            <PaperclipIcon className="size-5" />
          </button>
          <input
            ref={archivosRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              sumarArchivos(e.target.files)
              e.target.value = ''
            }}
          />
          <textarea
            ref={cajaRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              // Enter envía; Shift+Enter hace salto de línea.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                enviar()
              }
            }}
            // Pegar una captura del portapapeles la adjunta, como en Discord.
            onPaste={(e) => {
              const archivos = Array.from(e.clipboardData.files)
              if (archivos.length === 0) return
              e.preventDefault()
              const problema = validarArchivos(
                [...porEnviar, ...archivos].map((f) => ({ nombre: f.name, bytes: f.size })),
              )
              if (problema) {
                toast.error(problema)
                return
              }
              setPorEnviar((previos) => [...previos, ...archivos].slice(0, MAX_ARCHIVOS))
            }}
            rows={1}
            placeholder="Escribe un mensaje…"
            aria-label="Escribe un mensaje"
            // text-base (16px) en móvil: por debajo de 16px iOS hace zoom automático al
            // enfocar el campo, y la pantalla queda descolocada. En escritorio vuelve a 14.
            className="flex-1 bg-transparent resize-none outline-none text-base sm:text-[14px] text-[var(--tx-ink-primary)] max-h-40 overflow-y-auto"
          />
          <button
            onClick={enviar}
            disabled={(!borrador.trim() && porEnviar.length === 0) || enviando}
            aria-label="Enviar mensaje"
            className="shrink-0 disabled:opacity-40 text-[var(--tx-accent)]"
          >
            {enviando ? (
              <Loader2Icon className="size-5 animate-spin" />
            ) : (
              <SendIcon className="size-5" />
            )}
          </button>
        </div>

        {/* Subir un archivo grande tarda. Sin esto la pantalla se ve igual que
            cuando se manda solo texto, y no se sabe si está pasando algo. */}
        {subiendo && (
          <p className="px-4 pt-1.5 text-[12px] text-[var(--tx-ink-muted)]" aria-live="polite">
            {subiendo.total === 1
              ? 'Subiendo el archivo…'
              : `Subiendo archivos… ${subiendo.hechos} de ${subiendo.total}`}
          </p>
        )}
      </div>
    </div>

      {hiloAbierto && (
        <PanelHilo
          conversacion={conversacion}
          padre={hiloAbierto}
          miembros={porId}
          onCerrar={() => setHiloAbierto(null)}
          onRespondido={(padreId) =>
            setMensajes((previos) =>
              previos.map((m) => (m.id === padreId ? { ...m, respuestas: (m.respuestas ?? 0) + 1 } : m)),
            )
          }
        />
      )}
    </div>
  )
}

interface BotonLlamarProps {
  etiqueta: string
  onClick: () => void
  /** Pinta el botón como "hay algo pasando acá": una llamada ya en curso. */
  destacado?: boolean
  children: React.ReactNode
}

/**
 * 40px de lado y con `title`: en el teléfono se toca con el pulgar sin apuntar,
 * y en el escritorio se entiende sin adivinar qué hace el icono.
 */
function BotonLlamar({ etiqueta, onClick, destacado = false, children }: BotonLlamarProps) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="inline-flex size-10 items-center justify-center rounded-full transition-colors"
      style={{
        color: destacado ? 'var(--tx-accent)' : 'var(--tx-ink-muted)',
        background: destacado ? 'oklch(62% 0.19 255 / 15%)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}
