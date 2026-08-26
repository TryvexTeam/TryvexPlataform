import { ScoopCard } from '@/components/dashboard/scoop-card'
import { AvatarIntegrante } from '@/components/shared/avatar-integrante'
import type { TareaConResponsables } from '@/lib/types/tarea'

/**
 * Tarjeta de tarea del día.
 *
 * La primera de la lista —la más urgente— va en acento: es la acción
 * siguiente, la única cosa roja de la pantalla. Las demás quedan en la
 * superficie neutra para que el contraste haga el trabajo de jerarquía.
 *
 * En celular van dos por fila, así que la tarjeta encoge: el título baja de
 * tamaño y la descripción desaparece. Lo que queda es lo mínimo para decidir
 * cuál abrir — el detalle vive en la ficha.
 */

interface TareaScoopCardProps {
  tarea: TareaConResponsables
  /** Días vencida; 0 o menos = todavía en fecha. */
  diasVencida: number
  /** Tarjeta de acento. Solo la primera de la sección. */
  acento?: boolean
  /**
   * Pinta el responsable. En la vista propia se omite: la tarea ya es mía,
   * repetir mi nombre en cada tarjeta no dice nada.
   */
  mostrarResponsable?: boolean
  /** Posición en la lista: escalona la entrada. */
  indice?: number
}

const PRIORIDAD_LABEL: Record<TareaConResponsables['prioridad'], string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

/** Etiqueta de plazo en lenguaje de persona, no una fecha ISO cruda. */
function etiquetaPlazo(diasVencida: number, fechaLimite: string | null): string {
  if (diasVencida > 0) return `Vencida ${diasVencida} ${diasVencida === 1 ? 'día' : 'días'}`
  if (diasVencida === 0) return 'Vence hoy'
  if (!fechaLimite) return 'Sin fecha'
  if (diasVencida === -1) return 'Mañana'
  return new Date(`${fechaLimite}T12:00:00`).toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
  })
}

export function TareaScoopCard({
  tarea,
  diasVencida,
  acento = false,
  mostrarResponsable = false,
  indice = 0,
}: TareaScoopCardProps) {
  const vencida = diasVencida > 0
  const responsable = mostrarResponsable ? tarea.responsables[0] : undefined
  const plazo = etiquetaPlazo(diasVencida, tarea.fecha_limite)

  // El acento (fondo rojo con trama diagonal) es "la única cosa roja de la
  // pantalla" -- pero una tarea vencida YA es roja por su cuenta (badge +
  // borde). Combinar los dos es la tarjeta ilegible que reportó la crítica:
  // rayas rojas, badge rojo y texto rojo todo junto. Vencida gana: se apaga
  // el hatch y el rojo queda solo en el badge de la fecha.
  const conAcento = acento && !vencida

  const bordePlazo = conAcento
    ? 'rgba(255,255,255,.28)'
    : vencida
      ? 'rgba(232,53,42,.3)'
      : 'rgba(255,255,255,.10)'
  const tintaPlazo = conAcento ? '#ffffff' : vencida ? 'var(--tx-accent-2)' : 'var(--tx-ink-secondary)'

  return (
    <ScoopCard
      href={`/tareas?tarea=${tarea.id}`}
      accion={`Abrir ${tarea.titulo}`}
      acento={conAcento}
      indice={indice}
      className="flex h-full flex-col p-4 md:p-5"
      style={
        // Vencida sin el hatch: el borde izquierdo lleva el acento rojo en
        // vez del fondo, para no perder del todo la señal de urgencia.
        vencida ? { borderLeft: '3px solid rgba(232,53,42,.55)' } : undefined
      }
    >
      {responsable && (
        <div className="mb-3 flex items-center gap-2.5">
          <AvatarIntegrante
            nombre={responsable.nombre}
            avatarUrl={responsable.avatar_url}
            size={32}
          />
          <p
            className={`truncate text-[12.5px] font-medium ${
              conAcento ? 'text-white' : 'text-[var(--tx-ink-primary)]'
            }`}
          >
            {responsable.nombre}
          </p>
        </div>
      )}

      {/* `pr-12` deja sitio al botón de la muesca: sin eso el título se le
          mete debajo en las dos primeras líneas. */}
      <p
        className={`mt-1 line-clamp-3 pr-12 text-[16px] font-semibold leading-tight tracking-[-0.02em] md:mt-2 md:text-[21px] md:tracking-[-0.025em] ${
          conAcento ? 'text-white' : 'text-[var(--tx-ink-primary)]'
        }`}
      >
        {tarea.titulo}
      </p>

      {tarea.descripcion && (
        <p
          className={`mt-2 hidden text-sm line-clamp-3 md:block ${
            conAcento ? 'text-white/80' : 'text-muted-foreground'
          }`}
        >
          {tarea.descripcion}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-5">
        <span
          className="inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-medium"
          style={
            // Vencida: chip con fondo sólido neutro y borde/texto rojo, no
            // rojo-sobre-rojo con el fondo de la tarjeta -- el rojo queda
            // reservado para este badge, nunca como fondo detrás del texto.
            vencida
              ? {
                  background: 'var(--tx-bg-primary)',
                  borderColor: 'rgba(232,53,42,.45)',
                  color: 'var(--tx-accent-2)',
                }
              : { borderColor: bordePlazo, color: tintaPlazo }
          }
        >
          {plazo}
        </span>
        <span
          className="inline-flex h-[26px] items-center rounded-full border px-2.5 text-[11px] font-medium"
          style={{
            borderColor: conAcento ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.10)',
            color: conAcento ? '#ffffff' : 'var(--tx-ink-secondary)',
          }}
        >
          {PRIORIDAD_LABEL[tarea.prioridad]}
        </span>
      </div>
    </ScoopCard>
  )
}
