'use client'

/**
 * El control de "ofrecer mis horas en tryvex.tech", encima de la rejilla.
 *
 * Vive acá y no en /settings porque la decisión de qué horas se ofrecen se
 * toma mirando la grilla: en una pantalla de preferencias no se ve cuáles son.
 * Y sale del archivo de la rejilla porque esa ya cargaba con el arrastre, el
 * cálculo de ventanas comunes y el guardado; sumarle esto la volvía un archivo
 * que hace de todo.
 */

/** Qué capa de la rejilla está editando el arrastre. */
export type ModoRejilla = 'propia' | 'publica'

interface PanelCitasWebProps {
  recibeCitas: boolean
  onRecibeCitasChange: (valor: boolean) => void
  /** Si la empresa ya publicó a esta persona en la web (migración 044). */
  visibleEnLanding: boolean
  horasOfrecidas: number
  modo: ModoRejilla
  onModoChange: (modo: ModoRejilla) => void
}

/** Qué decirle a la persona según en cuál de los cuatro estados está. */
function textoDeAyuda(
  visibleEnLanding: boolean,
  recibeCitas: boolean,
  horasOfrecidas: number
): string {
  if (!visibleEnLanding) {
    return 'Primero el administrador tiene que publicar tu perfil en tryvex.tech.'
  }
  if (!recibeCitas) return 'Tus horas no se ofrecen a nadie fuera del equipo.'
  if (horasOfrecidas === 0) {
    return 'Marca abajo qué horas quieres ofrecer. Sin ninguna marcada no aparece nada en la web.'
  }
  return `Ofreces ${horasOfrecidas} ${horasOfrecidas === 1 ? 'hora' : 'horas'} en el formulario de tryvex.tech.`
}

export function PanelCitasWeb({
  recibeCitas,
  onRecibeCitasChange,
  visibleEnLanding,
  horasOfrecidas,
  modo,
  onModoChange,
}: PanelCitasWebProps) {
  const puedeEditar = visibleEnLanding

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.03)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={recibeCitas}
        aria-label="Recibir citas desde la web"
        disabled={!puedeEditar}
        onClick={() => onRecibeCitasChange(!recibeCitas)}
        style={{
          position: 'relative',
          width: '38px',
          height: '22px',
          flexShrink: 0,
          borderRadius: '999px',
          border: 'none',
          padding: 0,
          cursor: puedeEditar ? 'pointer' : 'not-allowed',
          opacity: puedeEditar ? 1 : 0.4,
          background: recibeCitas ? 'var(--tx-accent)' : 'rgba(255,255,255,0.14)',
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: recibeCitas ? '19px' : '3px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
          }}
        />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-ink-primary)' }}>
          Recibir citas desde la web
        </span>
        {/* El interruptor no se esconde cuando no aplica: verlo apagado y leer
            por qué se entiende mejor que no encontrarlo en ninguna parte. */}
        <span style={{ fontSize: '11.5px', color: 'var(--tx-ink-muted)', lineHeight: 1.45 }}>
          {textoDeAyuda(visibleEnLanding, recibeCitas, horasOfrecidas)}
        </span>
      </div>

      {/* El selector solo existe cuando hay algo que seleccionar: con el
          interruptor apagado, un modo "horas para citas" editaría algo que no
          se publica. */}
      {recibeCitas && puedeEditar && (
        <div
          style={{
            display: 'flex',
            gap: '2px',
            marginLeft: 'auto',
            padding: '2px',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          {(
            [
              ['propia', 'Mi disponibilidad'],
              ['publica', 'Horas para citas'],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              onClick={() => onModoChange(valor)}
              aria-pressed={modo === valor}
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '6px 11px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'inherit',
                color: modo === valor ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
                background: modo === valor ? 'rgba(255,255,255,0.09)' : 'transparent',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
