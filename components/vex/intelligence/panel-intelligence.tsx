'use client'

import { useState } from 'react'
import { AlertTriangle, Brain, Radio } from 'lucide-react'
import { SalaAgentes } from './sala-agentes'
import { EspacioAgente } from './espacio-agente'
import { PanelHilos } from './panel-hilos'
import { PanelCostos, type CostoAgente } from './panel-costos'
import { PanelCanales } from './panel-canales'
import { PanelCola } from './panel-cola'
import { PanelTraspasos } from './panel-traspasos'
import { PanelMetricas, type MetricasSala } from './panel-metricas'
import { PanelCampanas, type Campana } from './panel-campanas'
import { PanelConocimiento, type DocumentoConocimiento } from './panel-conocimiento'
import { PanelInsights } from './panel-insights'
import { PanelMejoras } from './panel-mejoras'
import { PanelDirectivas } from './panel-directivas'
import { PanelDemos } from './panel-demos'
import type { AlcanceDirectiva, Directiva } from '@/lib/repos/directivas'
import { useRefrescoEnVivo } from '@/lib/vex/usar-refresco-en-vivo'
import type { EncargoReal } from '@/lib/repos/intelligence-real'
import type { Insight } from '@/lib/repos/intelligence-whatsapp'
import type { Mejora, TasaCLP } from '@/lib/repos/intelligence-equipo'
import type {
  AgenteSala,
  Canal,
  ConversacionCliente,
  Encargo,
  EntradaHilo,
  Herramienta,
  Rutina,
  Traspaso,
} from '@/lib/types/sala-agentes'

/**
 * El marco de Tryvex Intelligence.
 *
 * Todo lo que llega acá sale de la base o del agente de WhatsApp: no queda
 * ningún dato escrito en el código. Si una fuente falla, la página lo dice en
 * `avisos` y el resto sigue funcionando.
 *
 * Las vistas se agrupan por la pregunta que responden, no por orden de
 * construcción:
 *   · Trabajo      — qué le pedimos a los agentes y qué están haciendo
 *   · Clientes     — qué pasa con la gente de afuera
 *   · Rendimiento  — si sirve, cuánto cuesta y qué mejorar
 *
 * El panel de WhatsApp de siempre llega como `panelWhatsapp`: lo arma el
 * servidor porque usa el token del agente, que no puede llegar al navegador.
 */

type Resultado = { ok: true } | { ok: false; error: string }

interface PanelIntelligenceProps {
  agentes: AgenteSala[]
  cola: EncargoReal[]
  recargarCola: () => Promise<EncargoReal[]>
  encargosSala: Encargo[]
  hilos: Record<string, EntradaHilo[]>
  rutinas: Rutina[]
  herramientas: Herramienta[]
  fichas: Record<string, { expiraAt: string | null; memoria: string[] }>
  conversaciones: ConversacionCliente[]
  traspasos: Traspaso[]
  canales: Canal[]
  campanas: Campana[]
  metricas: MetricasSala
  diasMetricas: number
  /** Ventana de las dudas del VPS; no es la misma que la de Métricas. */
  diasInsights: number
  insights: Insight[]
  vpsDisponible: boolean
  mejoras: Mejora[]
  documentos: DocumentoConocimiento[]
  costos: CostoAgente[]
  costosSinReporte: string[]
  costosAviso?: string
  tasaCLP: TasaCLP | null
  /** Fuentes que fallaron al cargar, explicadas. Vacío si todo respondió. */
  avisos: string[]
  alEncolar: React.ComponentProps<typeof PanelCola>['alEncolar']
  alAprobar: (id: string) => Promise<Resultado>
  alRechazar: (id: string, motivo: string) => Promise<Resultado>
  alArchivar: (id: string) => Promise<Resultado>
  alCambiarRutina: (id: string, activa: boolean) => Promise<Resultado>
  alAprobarMejora: (id: string) => Promise<Resultado>
  alAplicarMejora: (id: string) => Promise<Resultado>
  alDescartarMejora: (id: string, motivo: string) => Promise<Resultado>
  /** Decisiones del equipo que todos los agentes leen. */
  directivas: Directiva[]
  alCrearDirectiva: (datos: { texto: string; alcance: AlcanceDirectiva; vigenteHasta?: string }) => Promise<Resultado>
  alDesactivarDirectiva: (id: string) => Promise<Resultado>
  /** Demos de agente por número, y los leads para armarlas. */
  demos: React.ComponentProps<typeof PanelDemos>['demos']
  leadsParaDemo: React.ComponentProps<typeof PanelDemos>['leads']
  alSugerirDemo: React.ComponentProps<typeof PanelDemos>['alSugerir']
  alCrearDemo: React.ComponentProps<typeof PanelDemos>['alCrear']
  alApagarDemo: React.ComponentProps<typeof PanelDemos>['alApagar']
  panelWhatsapp: React.ReactNode
}

type Vista =
  | 'cola'
  | 'sala'
  | 'espacio'
  | 'directivas'
  | 'conversaciones'
  | 'traspasos'
  | 'canales'
  | 'campanas'
  | 'demos'
  | 'metricas'
  | 'insights'
  | 'mejoras'
  | 'conocimiento'
  | 'costos'
  | 'whatsapp'

type Tono = 'accent' | 'warning' | 'error'

interface Pestana {
  vista: Vista
  nombre: string
  contador?: number
  tono?: Tono
}

export function PanelIntelligence(props: PanelIntelligenceProps) {
  const { agentes, cola, avisos } = props
  const [vista, setVista] = useState<Vista>('cola')
  const { enVivo } = useRefrescoEnVivo()

  const grupos: Array<{ titulo: string; pestanas: Pestana[] }> = [
    {
      titulo: 'Trabajo',
      pestanas: [
        { vista: 'cola', nombre: 'Cola', contador: cola.filter((e) => e.estado === 'encolado').length, tono: 'warning' },
        { vista: 'sala', nombre: 'Sala' },
        { vista: 'espacio', nombre: 'Espacio del agente' },
        {
          vista: 'directivas',
          nombre: 'Directivas',
          contador: props.directivas.filter((d) => d.vigente).length,
          tono: 'accent',
        },
      ],
    },
    {
      titulo: 'Clientes',
      pestanas: [
        {
          vista: 'conversaciones',
          nombre: 'Conversaciones',
          contador: props.conversaciones.reduce((t, c) => t + c.sinLeer, 0),
          tono: 'accent',
        },
        {
          vista: 'traspasos',
          nombre: 'Traspasos',
          contador: props.traspasos.filter((t) => t.clienteEsperando).length,
          tono: 'error',
        },
        {
          vista: 'canales',
          nombre: 'Canales',
          contador: props.canales.filter((c) => c.aviso && c.aviso.severidad !== 'info').length,
          tono: 'warning',
        },
        { vista: 'campanas', nombre: 'Campañas' },
        {
          vista: 'demos',
          nombre: 'Demos',
          contador: props.demos.filter((d) => d.vigente).length,
          tono: 'accent',
        },
      ],
    },
    {
      titulo: 'Rendimiento',
      pestanas: [
        { vista: 'metricas', nombre: 'Métricas' },
        { vista: 'insights', nombre: 'Insights', contador: props.insights.length, tono: 'accent' },
        {
          vista: 'mejoras',
          nombre: 'Mejoras',
          contador: props.mejoras.filter((m) => m.estado === 'propuesta').length,
          tono: 'warning',
        },
        {
          vista: 'conocimiento',
          nombre: 'Conocimiento',
          contador: props.documentos.filter((d) => d.citasMes === 0).length,
          tono: 'warning',
        },
        { vista: 'costos', nombre: 'Costos' },
      ],
    },
    { titulo: 'Número', pestanas: [{ vista: 'whatsapp', nombre: 'Agente de WhatsApp' }] },
  ]

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-3 sm:p-5">
      <header className="flex flex-wrap items-center gap-3">
        <Brain size={20} style={{ color: 'var(--tx-accent)' }} />
        <div className="mr-auto min-w-0">
          <h1 className="text-lg font-semibold text-[var(--tx-ink-primary)]">Tryvex Intelligence</h1>
          <p className="text-xs text-[var(--tx-ink-muted)]">
            Dónde el equipo reparte trabajo a los agentes, da permiso para lo que se ejecuta y revisa
            lo entregado.
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
          style={{
            border: '1px solid var(--tx-border)',
            background: 'var(--tx-surface-1)',
            color: enVivo ? 'var(--tx-success)' : 'var(--tx-ink-muted)',
          }}
          title={
            enVivo
              ? 'Escuchando cambios: la pantalla se actualiza sola.'
              : 'Sin conexión en vivo: lo que ve puede no estar al día. Recargue la página.'
          }
        >
          <Radio size={12} className={enVivo ? 'motion-safe:animate-pulse' : undefined} />
          {enVivo ? 'en vivo' : 'sin conexión'}
        </span>
      </header>

      {/* En el celular, un selector nativo: trece botones no caben y el del sistema es el más cómodo con el pulgar. */}
      <label className="flex flex-col gap-1 sm:hidden">
        <span className="text-[11px] text-[var(--tx-ink-muted)]">Vista</span>
        <select
          value={vista}
          onChange={(e) => setVista(e.target.value as Vista)}
          className="w-full rounded-xl px-3 py-2.5 text-sm"
          style={{
            border: '1px solid var(--tx-border)',
            background: 'var(--tx-surface-1)',
            color: 'var(--tx-ink-primary)',
          }}
        >
          {grupos.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.pestanas.map((p) => (
                <option key={p.vista} value={p.vista}>
                  {p.nombre}
                  {p.contador ? ` (${p.contador})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <nav aria-label="Vistas de Intelligence" className="hidden flex-wrap gap-2 sm:flex">
        {grupos.map((g) => (
          <div
            key={g.titulo}
            className="flex items-center gap-0.5 rounded-xl p-1"
            style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-2)' }}
            role="group"
            aria-label={g.titulo}
          >
            <span className="px-2 text-[10px] uppercase tracking-wider text-[var(--tx-ink-muted)]">
              {g.titulo}
            </span>
            {g.pestanas.map((p) => (
              <Opcion key={p.vista} activa={vista === p.vista} onClick={() => setVista(p.vista)}>
                {p.nombre}
                {p.contador ? <Contador valor={p.contador} tono={p.tono ?? 'accent'} /> : null}
              </Opcion>
            ))}
          </div>
        ))}
      </nav>

      {avisos.length > 0 && (
        <div
          className="flex flex-col gap-1 rounded-xl px-3 py-2"
          role="status"
          style={{
            border: '1px solid color-mix(in oklab, var(--tx-warning) 45%, transparent)',
            background: 'color-mix(in oklab, var(--tx-warning) 10%, transparent)',
          }}
        >
          {avisos.map((a) => (
            <p key={a} className="flex items-start gap-2 text-xs text-[var(--tx-ink-secondary)]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--tx-warning)' }} />
              {a}
            </p>
          ))}
        </div>
      )}

      {vista === 'cola' && (
        <PanelCola
          agentes={agentes}
          inicial={cola}
          recargar={props.recargarCola}
          alEncolar={props.alEncolar}
          alAprobar={props.alAprobar}
          alRechazar={props.alRechazar}
          alArchivar={props.alArchivar}
        />
      )}
      {vista === 'sala' && <SalaAgentes agentes={agentes} encargos={props.encargosSala} />}
      {vista === 'espacio' && (
        <EspacioAgente
          agentes={agentes}
          hilos={props.hilos}
          rutinas={props.rutinas}
          herramientas={props.herramientas}
          fichas={props.fichas}
          alEncolar={props.alEncolar}
          alCambiarRutina={props.alCambiarRutina}
        />
      )}
      {vista === 'directivas' && (
        <PanelDirectivas
          directivas={props.directivas}
          alCrear={props.alCrearDirectiva}
          alDesactivar={props.alDesactivarDirectiva}
        />
      )}
      {vista === 'conversaciones' && <PanelHilos conversaciones={props.conversaciones} agentes={agentes} />}
      {vista === 'traspasos' && <PanelTraspasos traspasos={props.traspasos} agentes={agentes} />}
      {vista === 'canales' && <PanelCanales canales={props.canales} agentes={agentes} />}
      {vista === 'campanas' && <PanelCampanas campanas={props.campanas} agentes={agentes} />}
      {vista === 'demos' && (
        <PanelDemos
          demos={props.demos}
          leads={props.leadsParaDemo}
          alSugerir={props.alSugerirDemo}
          alCrear={props.alCrearDemo}
          alApagar={props.alApagarDemo}
        />
      )}
      {vista === 'metricas' && <PanelMetricas metricas={props.metricas} dias={props.diasMetricas} />}
      {vista === 'insights' && (
        <PanelInsights insights={props.insights} vpsDisponible={props.vpsDisponible} dias={props.diasInsights} />
      )}
      {vista === 'mejoras' && (
        <PanelMejoras
          mejoras={props.mejoras}
          agentes={agentes}
          alAprobar={props.alAprobarMejora}
          alAplicar={props.alAplicarMejora}
          alDescartar={props.alDescartarMejora}
        />
      )}
      {vista === 'conocimiento' && <PanelConocimiento documentos={props.documentos} agentes={agentes} />}
      {vista === 'costos' && (
        <PanelCostos
          costos={props.costos}
          agentes={agentes}
          tasaCLP={props.tasaCLP}
          sinReporte={props.costosSinReporte}
          aviso={props.costosAviso}
        />
      )}
      {vista === 'whatsapp' && <div className="mx-auto w-full max-w-3xl">{props.panelWhatsapp}</div>}
    </div>
  )
}

function Contador({ valor, tono }: { valor: number; tono: Tono }) {
  // Cada fondo con SU color de texto. El acento cambia según el tema (en el
  // oscuro es claro): con texto blanco fijo, el número quedaba invisible.
  const fondo = { accent: 'var(--tx-accent)', warning: 'var(--tx-warning)', error: 'var(--tx-error)' }[tono]
  const texto = { accent: 'var(--tx-accent-fg)', warning: '#14141b', error: '#fff' }[tono]
  return (
    <span
      className="ml-1.5 rounded-full px-1.5 text-[10px] tabular-nums"
      style={{ background: fondo, color: texto }}
    >
      {valor}
    </span>
  )
}

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className="rounded-lg px-3 py-1.5 text-xs transition-colors"
      style={{
        background: activa ? 'var(--tx-surface-0)' : 'transparent',
        color: activa ? 'var(--tx-ink-primary)' : 'var(--tx-ink-muted)',
        fontWeight: activa ? 600 : 400,
      }}
    >
      {children}
    </button>
  )
}
