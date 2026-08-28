'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { AjustesAgente, ClaveAjuste } from '@/lib/vex/agente'

/**
 * Ajustes del agente, con efecto inmediato.
 *
 * El agente los lee en caliente —consulta el valor en cada mensaje—, así que
 * guardar acá cambia su comportamiento en la conversación siguiente sin
 * reiniciar nada. Eso importa: reiniciar el proceso a lo bruto desincroniza la
 * sesión de WhatsApp y deja al agente sordo para los contactos activos.
 */

interface CampoNumero {
  clave: ClaveAjuste
  etiqueta: string
  ayuda: string
  min: number
  max: number
  paso?: number
  sufijo?: string
}

const TIEMPOS: CampoNumero[] = [
  {
    clave: 'buffer_seconds',
    etiqueta: 'Espera antes de responder',
    ayuda:
      'Segundos que aguarda por si el lead sigue escribiendo, para contestar a todo junto en vez de mensaje por mensaje.',
    min: 0,
    max: 120,
    sufijo: 'seg',
  },
  {
    clave: 'seguimiento_horas',
    etiqueta: 'Seguimiento a leads fríos',
    ayuda:
      'Horas de silencio antes de un único mensaje de seguimiento. Es la única vez que el agente escribe sin que le hayan escrito. En 0 queda apagado.',
    min: 0,
    max: 168,
    sufijo: 'hs',
  },
  {
    clave: 'temperature',
    etiqueta: 'Libertad de redacción',
    ayuda: 'Más bajo, más predecible y pegado al guion. Más alto, más suelto.',
    min: 0,
    max: 1.5,
    paso: 0.1,
  },
]

interface CampoTexto {
  clave: ClaveAjuste
  etiqueta: string
  ayuda: string
}

const MODELOS: CampoTexto[] = [
  {
    clave: 'model',
    etiqueta: 'Modelo que conversa',
    ayuda: 'El cerebro del agente. Identificador de OpenRouter.',
  },
  {
    clave: 'transcription_model',
    etiqueta: 'Modelo que transcribe audios',
    ayuda: 'Convierte las notas de voz del lead en texto.',
  },
  {
    clave: 'vision_model',
    etiqueta: 'Modelo que interpreta imágenes',
    ayuda: 'Lee las fotos y capturas que manda el lead.',
  },
]

interface PanelAjustesProps {
  inicial: AjustesAgente
}

export function PanelAjustes({ inicial }: PanelAjustesProps) {
  const [ajustes, setAjustes] = useState<AjustesAgente>(inicial)
  const [guardando, setGuardando] = useState<ClaveAjuste | null>(null)

  const recargar = useCallback(async () => {
    try {
      const res = await fetch('/api/vex/agente/ajustes', { cache: 'no-store' })
      const cuerpo = await res.json().catch(() => ({}))
      if (res.ok && cuerpo.data?.settings) setAjustes(cuerpo.data.settings)
    } catch {
      // Silencioso: es una recuperación, y el error del guardado ya se mostró.
    }
  }, [])

  const guardar = useCallback(async (clave: ClaveAjuste, valor: string) => {
    setGuardando(clave)
    try {
      const res = await fetch('/api/vex/agente/ajustes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: clave, value: valor }),
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(cuerpo?.error ?? `no se pudo guardar (${res.status})`)

      // Se usa lo que devolvió el agente, no lo que se envió: el agente acota
      // los valores fuera de rango y hay que reflejar cómo quedó de verdad.
      if (cuerpo.data?.settings) setAjustes(cuerpo.data.settings)
      toast.success('Guardado')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar')
      // Se recarga el estado real: dejar en pantalla un valor que no se guardó
      // es peor que perder lo tecleado.
      void recargar()
    } finally {
      setGuardando(null)
    }
  }, [recargar])

  const pausado = ajustes.paused === '1'

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Estado del agente</CardTitle>
          <CardDescription>
            Pausarlo lo silencia en todas las conversaciones. Los mensajes de los leads siguen
            llegando y quedan registrados; simplemente nadie los contesta solo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'flex items-center justify-between gap-4 rounded-lg p-4',
              pausado && 'ring-1 ring-[var(--tx-warning)]'
            )}
            style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
          >
            <div>
              <p className="text-sm font-medium text-[var(--tx-ink-primary)]">
                {pausado ? 'Pausado' : 'Respondiendo'}
              </p>
              <p className="text-xs text-[var(--tx-ink-muted)] mt-0.5">
                {pausado
                  ? 'El agente no está contestando a nadie.'
                  : 'El agente contesta a quien ya respondió el primer mensaje.'}
              </p>
            </div>
            <Switch
              checked={!pausado}
              disabled={guardando === 'paused'}
              onCheckedChange={(activo) => guardar('paused', activo ? '0' : '1')}
              aria-label="Agente activo"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tiempos y tono</CardTitle>
          <CardDescription>Cambian el comportamiento en la conversación siguiente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {TIEMPOS.map((campo) => (
            <CampoNumerico
              key={campo.clave}
              campo={campo}
              valor={ajustes[campo.clave]}
              guardando={guardando === campo.clave}
              onGuardar={guardar}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué entiende</CardTitle>
          <CardDescription>
            Apagar uno no rompe nada: el agente sigue conversando, pero deja de procesar ese tipo de
            mensaje.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Interruptor
            etiqueta="Notas de voz"
            ayuda="Transcribe los audios que manda el lead."
            activo={ajustes.audio_enabled === '1'}
            guardando={guardando === 'audio_enabled'}
            onCambiar={(v) => guardar('audio_enabled', v ? '1' : '0')}
          />
          <Interruptor
            etiqueta="Imágenes"
            ayuda="Interpreta las fotos y capturas que manda el lead."
            activo={ajustes.vision_enabled === '1'}
            guardando={guardando === 'vision_enabled'}
            onCambiar={(v) => guardar('vision_enabled', v ? '1' : '0')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelos</CardTitle>
          <CardDescription>
            Identificadores de OpenRouter. Cambiar a un modelo que no existe deja al agente sin
            responder, así que conviene verificar el nombre antes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {MODELOS.map((campo) => (
            <CampoDeTexto
              key={campo.clave}
              campo={campo}
              valor={ajustes[campo.clave]}
              porDefecto={inicial[campo.clave]}
              guardando={guardando === campo.clave}
              onGuardar={guardar}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

interface CampoNumericoProps {
  campo: CampoNumero
  valor: string
  guardando: boolean
  onGuardar: (clave: ClaveAjuste, valor: string) => void
}

function CampoNumerico({ campo, valor, guardando, onGuardar }: CampoNumericoProps) {
  const [borrador, setBorrador] = useState(valor)

  // Si el valor real cambia —el agente lo acotó, u otra persona lo tocó— gana
  // ese. Se ajusta DURANTE el render y no con un efecto: así no hay un instante
  // en el que la pantalla muestre el valor viejo, ni renders encadenados.
  const [valorVisto, setValorVisto] = useState(valor)
  if (valor !== valorVisto) {
    setValorVisto(valor)
    setBorrador(valor)
  }

  const sinGuardar = borrador !== valor

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={campo.clave} className="text-sm">
        {campo.etiqueta}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={campo.clave}
          type="number"
          inputMode="decimal"
          min={campo.min}
          max={campo.max}
          step={campo.paso ?? 1}
          value={borrador}
          disabled={guardando}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => sinGuardar && onGuardar(campo.clave, borrador)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setBorrador(valor)
          }}
          className="max-w-32 tabular-nums"
        />
        {campo.sufijo && (
          <span className="text-xs text-[var(--tx-ink-muted)]">{campo.sufijo}</span>
        )}
        {guardando && <Loader2 size={14} className="animate-spin text-[var(--tx-ink-muted)]" />}
      </div>
      <p className="text-xs text-[var(--tx-ink-muted)] max-w-prose">{campo.ayuda}</p>
    </div>
  )
}

interface CampoDeTextoProps {
  campo: CampoTexto
  valor: string
  porDefecto: string
  guardando: boolean
  onGuardar: (clave: ClaveAjuste, valor: string) => void
}

function CampoDeTexto({ campo, valor, porDefecto, guardando, onGuardar }: CampoDeTextoProps) {
  const [borrador, setBorrador] = useState(valor)

  // Igual que arriba: se ajusta durante el render, sin efecto.
  const [valorVisto, setValorVisto] = useState(valor)
  if (valor !== valorVisto) {
    setValorVisto(valor)
    setBorrador(valor)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={campo.clave} className="text-sm">
        {campo.etiqueta}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={campo.clave}
          value={borrador}
          disabled={guardando}
          spellCheck={false}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => borrador !== valor && onGuardar(campo.clave, borrador)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setBorrador(valor)
          }}
          className="font-mono text-xs"
        />
        {guardando ? (
          <Loader2 size={14} className="animate-spin text-[var(--tx-ink-muted)] shrink-0" />
        ) : (
          valor !== porDefecto && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => onGuardar(campo.clave, porDefecto)}
              title={`Volver a ${porDefecto}`}
            >
              <RotateCcw size={13} />
            </Button>
          )
        )}
      </div>
      <p className="text-xs text-[var(--tx-ink-muted)] max-w-prose">{campo.ayuda}</p>
    </div>
  )
}

interface InterruptorProps {
  etiqueta: string
  ayuda: string
  activo: boolean
  guardando: boolean
  onCambiar: (activo: boolean) => void
}

function Interruptor({ etiqueta, ayuda, activo, guardando, onCambiar }: InterruptorProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-[var(--tx-ink-primary)]">{etiqueta}</p>
        <p className="text-xs text-[var(--tx-ink-muted)] mt-0.5">{ayuda}</p>
      </div>
      <Switch
        checked={activo}
        disabled={guardando}
        onCheckedChange={onCambiar}
        aria-label={etiqueta}
      />
    </div>
  )
}
