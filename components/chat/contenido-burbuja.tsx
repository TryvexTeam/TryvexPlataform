'use client'

import { memo, useState } from 'react'
import { Markdown } from '@/components/shared/markdown'
import { LARGO_PARA_RECORTAR } from '@/lib/types/chat'
import { debeRecortarse } from '@/lib/chat/limite'

/**
 * Texto de una burbuja. Un mensaje largo se recorta con "Leer más" para no comerse
 * la pantalla; no hay tope de caracteres, solo de alto visible.
 */
export const ContenidoBurbuja = memo(function ContenidoBurbuja({ contenido }: { contenido: string }) {
  const [abierto, setAbierto] = useState(false)
  const largo = debeRecortarse(contenido, LARGO_PARA_RECORTAR)
  const recortado = largo && !abierto

  return (
    <div>
      <div className={`chat-texto ${recortado ? 'chat-texto-recortado' : ''}`}>
        <Markdown chat heredaColor className="text-[length:var(--chat-texto)]">
          {contenido}
        </Markdown>
      </div>
      {largo && (
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="mt-1 min-h-8 text-[14px] font-semibold text-[var(--chat-accent)]"
        >
          {abierto ? 'Leer menos' : 'Leer más'}
        </button>
      )}
    </div>
  )
})
