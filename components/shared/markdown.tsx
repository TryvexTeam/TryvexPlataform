'use client'

import { createContext, Fragment, useContext } from 'react'
import { parsearInline, parsearMarkdown, type BloqueMd, type NodoInline } from '@/lib/markdown/mini'

interface MarkdownProps {
  /** Texto de la entrada tal cual quedó guardado. */
  children: string
  className?: string
  /**
   * Dentro de una burbuja de chat el color lo pone la burbuja (el mensaje propio
   * va sobre el acento). Con esto el markdown no impone el suyo y hereda.
   */
  heredaColor?: boolean
}

const HeredaColor = createContext(false)

/**
 * Pinta markdown. Arma nodos de React a partir del parser: nada de HTML crudo,
 * así que un mensaje de Discord o del chat no puede inyectar nada.
 */
export function Markdown({ children, className, heredaColor = false }: MarkdownProps) {
  const bloques = parsearMarkdown(children)
  const base = heredaColor
    ? 'tx-md leading-relaxed'
    : 'tx-md text-[13px] leading-relaxed text-[var(--tx-ink-secondary,var(--tx-ink-muted))]'

  return (
    <HeredaColor.Provider value={heredaColor}>
      <div className={`${base} ${className ?? ''}`}>
        {bloques.map((bloque, i) => (
          <Bloque key={i} bloque={bloque} />
        ))}
      </div>
    </HeredaColor.Provider>
  )
}

function Bloque({ bloque }: { bloque: BloqueMd }) {
  const hereda = useContext(HeredaColor)

  switch (bloque.tipo) {
    case 'titulo': {
      // Dentro de una tarjeta del timeline, un h1 de página sería ruido: se
      // escalan como subtítulos del propio bloque.
      const tamano = { 1: 'text-[15px]', 2: 'text-[14px]', 3: 'text-[13px]' }[bloque.nivel]
      const Etiqueta = (['h4', 'h5', 'h6'] as const)[bloque.nivel - 1]
      return (
        <Etiqueta
          className={`${tamano} font-semibold ${hereda ? '' : 'text-[var(--tx-ink-primary)]'} mt-3 first:mt-0 mb-1`}
        >
          <Inline nodos={bloque.contenido} />
        </Etiqueta>
      )
    }

    case 'lista': {
      const Etiqueta = bloque.ordenada ? 'ol' : 'ul'
      return (
        <Etiqueta
          className={`my-1.5 pl-5 space-y-0.5 ${bloque.ordenada ? 'list-decimal' : 'list-disc'} marker:text-[var(--tx-ink-muted)]`}
        >
          {bloque.items.map((item, i) => (
            <li key={i}>
              <Inline nodos={item} />
            </li>
          ))}
        </Etiqueta>
      )
    }

    case 'cita':
      return (
        <blockquote
          className={`my-2 pl-3 border-l-2 italic ${hereda ? 'border-current/40' : 'border-[var(--tx-ink-muted)]/40'}`}
        >
          <Inline nodos={bloque.contenido} />
        </blockquote>
      )

    case 'codigo':
      return (
        <pre className="my-2 p-2.5 rounded-lg overflow-x-auto bg-black/25 text-[12px] leading-snug">
          <code>{bloque.texto}</code>
        </pre>
      )

    case 'separador':
      return <hr className="my-3 border-[var(--tx-ink-muted)]/20" />

    case 'parrafo':
      return (
        <p className="my-1.5 first:mt-0 last:mb-0">
          <Inline nodos={bloque.contenido} />
        </p>
      )
  }
}

function Inline({ nodos }: { nodos: NodoInline[] }) {
  const hereda = useContext(HeredaColor)

  return (
    <>
      {nodos.map((nodo, i) => {
        switch (nodo.tipo) {
          case 'fuerte':
            return (
              <strong key={i} className={`font-semibold ${hereda ? '' : 'text-[var(--tx-ink-primary)]'}`}>
                {nodo.texto}
              </strong>
            )
          case 'enfasis':
            return <em key={i}>{nodo.texto}</em>
          case 'tachado':
            return <del key={i}>{nodo.texto}</del>
          case 'codigo':
            return (
              <code key={i} className="px-1 py-0.5 rounded bg-black/25 text-[12px] font-mono">
                {nodo.texto}
              </code>
            )
          case 'enlace':
            return (
              <a
                key={i}
                href={nodo.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`underline underline-offset-2 hover:opacity-80 ${hereda ? '' : 'text-[var(--tx-ink-primary)]'}`}
              >
                {nodo.texto}
              </a>
            )
          default:
            return <Fragment key={i}>{nodo.texto}</Fragment>
        }
      })}
    </>
  )
}

/** Una línea suelta con formato: para títulos de entrada, sin envolver en párrafo. */
export function MarkdownLinea({ children }: { children: string }) {
  return <Inline nodos={parsearInline(children)} />
}
