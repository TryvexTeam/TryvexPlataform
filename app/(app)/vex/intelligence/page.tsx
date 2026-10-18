import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import {
  obtenerAjustes,
  obtenerAnalytics,
  obtenerConversaciones,
  agenteConfigurado,
  type AnalyticsAgente,
} from '@/lib/vex/agente'
import { obtenerEstadoQr, type ResultadoQr } from '@/lib/wa/qr'
import { PanelAjustes } from '@/components/vex/intelligence/panel-ajustes'
import { PanelConversaciones } from '@/components/vex/intelligence/panel-conversaciones'
import { EstadoAgente } from '@/components/vex/intelligence/estado-agente'
import { PanelIntelligence } from '@/components/vex/intelligence/panel-intelligence'
import {
  comoEncargosDeSala,
  obtenerAgentesReales,
  obtenerEncargosReales,
} from '@/lib/repos/intelligence-real'
import {
  construirCanales,
  construirInsights,
  obtenerDatosWhatsapp,
  obtenerMetricas,
} from '@/lib/repos/intelligence-whatsapp'
import {
  herramientasDelCRM,
  obtenerCampanas,
  obtenerCostos,
  obtenerDocumentos,
  obtenerHilos,
  obtenerMejoras,
  obtenerRutinas,
  obtenerTasaCLP,
} from '@/lib/repos/intelligence-equipo'
import { listarDirectivas } from '@/lib/repos/directivas'
import { leadsParaDemo, listarDemos } from '@/lib/repos/demos'
import { apagarDemo, crearDemo, sugerirGuionDemo } from './acciones-demos'
import {
  aprobarEncargo,
  aprobarMejora,
  aplicarMejora,
  archivarEncargo,
  cambiarRutina,
  crearDirectiva,
  desactivarDirectiva,
  descartarMejora,
  encolarEncargo,
  rechazarEncargo,
} from './acciones'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tryvex Intelligence',
}

/** Ventana de Métricas. */
const DIAS_METRICAS = 14

/**
 * Ventana de la analítica del VPS: una sola llamada que sirve a Costos (el mes
 * calendario completo) y a Insights. Pedirla dos veces con ventanas distintas
 * serían dos clasificaciones con IA por día en el VPS.
 */
const DIAS_ANALITICA = 31

/**
 * Tryvex Intelligence — la sala donde trabajan los agentes del equipo.
 *
 * Todo sale de fuentes reales: la base (agentes, cola, mensajes de WhatsApp,
 * consumo, rutinas, conocimiento, campañas, mejoras) y el agente de WhatsApp en
 * el VPS (estado del número, gasto del bot, dudas de clientes).
 *
 * Cada fuente se pide en paralelo y se aísla: si el VPS está caído, las
 * pantallas que dependen de la base siguen funcionando, y lo que falta se
 * anuncia en `avisos` en vez de mostrarse vacío sin explicación. Una pantalla
 * en blanco manda a buscar el problema en el lugar equivocado.
 *
 * El token del agente de WhatsApp se usa solo acá, en el servidor.
 */
export default async function TryvexIntelligencePage() {
  const supabase = await createClient()

  // Mismo fusible que el layout: en desarrollo con BYPASS_AUTH no hay sesión.
  // Fuera de desarrollo `bypass` es false y todo pasa por la sesión de siempre.
  const bypass =
    process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === 'true'

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user && !bypass) redirect('/login')

  const perfil = user
    ? await new IntegrantesRepository(supabase).getByAuthUser(user.id)
    : null

  if (!perfil && !bypass) {
    return (
      <Marco>
        <Aviso
          titulo="Solo para integrantes del equipo"
          detalle="Operar a los agentes puede cambiar lo que se le responde a los leads, así que hace falta un perfil de integrante activo."
        />
      </Marco>
    )
  }

  // Sin sesión (solo en desarrollo con el atajo) las políticas no dejan leer.
  const datos = bypass ? createAdminClient() : supabase
  const avisos: string[] = []

  // Primero los agentes: casi todo lo demás se cruza con ellos.
  const { agentes, encargos: cola, fichas } = await obtenerAgentesReales(datos)

  // Lo que viene del VPS se pide una sola vez y se comparte. `null` = no
  // respondió; las pantallas lo tratan como "sin dato", nunca como cero.
  const [qr, analytics, tasa] = await Promise.all([
    agenteConfigurado()
      ? obtenerEstadoQr()
      : Promise.resolve<ResultadoQr>({ estado: 'no_configurado' }),
    agenteConfigurado()
      ? obtenerAnalytics(DIAS_ANALITICA).catch((): AnalyticsAgente | null => null)
      : Promise.resolve(null),
    obtenerTasaCLP(),
  ])
  if (agenteConfigurado() && !analytics) {
    avisos.push(
      'El agente de WhatsApp no entregó su analítica: faltan el gasto del bot, los leads captados y las dudas de clientes.',
    )
  }

  const whatsapp = await obtenerDatosWhatsapp(datos, agentes).catch((e: unknown) => {
    avisos.push(`No se pudieron leer los mensajes de WhatsApp: ${mensaje(e)}`)
    return { conversaciones: [], traspasos: [], mensajesHoy: 0, agenteBotId: null }
  })

  const [metricas, costos, documentos, rutinas, hilos, campanas, mejoras, directivas, demos, leadsDemo] = await Promise.all([
    obtenerMetricas(datos, DIAS_METRICAS, analytics, whatsapp.traspasos).catch((e: unknown) => {
      avisos.push(`No se pudieron calcular las métricas: ${mensaje(e)}`)
      return null
    }),
    obtenerCostos(datos, agentes, analytics, whatsapp.agenteBotId, tasa).catch((e: unknown) => {
      avisos.push(`No se pudieron leer los costos: ${mensaje(e)}`)
      return { costos: [], sinReporte: [], aviso: undefined }
    }),
    conRespaldo(obtenerDocumentos(datos), [], 'el conocimiento', avisos),
    conRespaldo(obtenerRutinas(datos), [], 'las rutinas', avisos),
    conRespaldo(obtenerHilos(datos, agentes), {}, 'el historial de encargos', avisos),
    conRespaldo(obtenerCampanas(datos), [], 'las campañas', avisos),
    conRespaldo(obtenerMejoras(datos), [], 'las mejoras', avisos),
    conRespaldo(listarDirectivas(datos), [], 'las directivas', avisos),
    conRespaldo(listarDemos(datos), [], 'las demos', avisos),
    conRespaldo(leadsParaDemo(datos), [], 'los leads para las demos', avisos),
  ])

  const dudasDelEquipo = cola.filter((e) => e.tipo === 'duda' && e.estado !== 'respondido')

  return (
    <PanelIntelligence
      agentes={agentes}
      cola={cola}
      recargarCola={async () => {
        'use server'
        const cliente = bypass ? createAdminClient() : await createClient()
        return obtenerEncargosReales(cliente)
      }}
      encargosSala={comoEncargosDeSala(cola)}
      hilos={hilos}
      rutinas={rutinas}
      herramientas={herramientasDelCRM()}
      fichas={fichas}
      conversaciones={whatsapp.conversaciones}
      traspasos={whatsapp.traspasos}
      canales={construirCanales(
        qr,
        whatsapp.mensajesHoy,
        whatsapp.agenteBotId,
        metricas?.sinRespuesta ?? 0,
      )}
      campanas={campanas}
      metricas={metricas ?? metricasVacias()}
      diasMetricas={DIAS_METRICAS}
      diasInsights={DIAS_ANALITICA}
      insights={construirInsights(analytics, dudasDelEquipo)}
      vpsDisponible={analytics !== null}
      mejoras={mejoras}
      documentos={documentos}
      costos={costos.costos}
      costosSinReporte={costos.sinReporte}
      costosAviso={costos.aviso}
      tasaCLP={tasa}
      avisos={avisos}
      alEncolar={encolarEncargo}
      alAprobar={aprobarEncargo}
      alRechazar={rechazarEncargo}
      alArchivar={archivarEncargo}
      alCambiarRutina={cambiarRutina}
      alAprobarMejora={aprobarMejora}
      alAplicarMejora={aplicarMejora}
      alDescartarMejora={descartarMejora}
      directivas={directivas}
      alCrearDirectiva={crearDirectiva}
      alDesactivarDirectiva={desactivarDirectiva}
      demos={demos}
      leadsParaDemo={leadsDemo}
      alSugerirDemo={sugerirGuionDemo}
      alCrearDemo={crearDemo}
      alApagarDemo={apagarDemo}
      panelWhatsapp={await PanelDeWhatsapp(qr)}
    />
  )
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}

/** Una fuente que falla no tumba la página: se anuncia y se sigue. */
async function conRespaldo<T>(promesa: Promise<T>, respaldo: T, que: string, avisos: string[]): Promise<T> {
  try {
    return await promesa
  } catch (e) {
    avisos.push(`No se pudo leer ${que}: ${mensaje(e)}`)
    return respaldo
  }
}

/** Si las métricas fallan, se muestran vacías y el aviso explica por qué. */
function metricasVacias() {
  return {
    conversaciones: 0,
    resueltasSinHumano: 0,
    traspasos: 0,
    leadsCaptados: null,
    reuniones: null,
    segundosPrimeraRespuesta: null,
    frenosAplicados: null,
    serieConversaciones: [],
    serieResueltas: [],
    motivosTraspaso: [],
  }
}

/**
 * El panel de siempre: estado del número, conversaciones y ajustes.
 *
 * Recibe el estado del QR ya consultado para no pedírselo dos veces al VPS: la
 * pantalla de Canales usa el mismo.
 */
async function PanelDeWhatsapp(qr: ResultadoQr) {
  if (!agenteConfigurado()) {
    return (
      <Aviso
        titulo="El agente de WhatsApp todavía no está conectado"
        detalle="Faltan VEX_AGENT_URL y VEX_AGENT_TOKEN en el entorno del CRM. Mientras tanto, el equipo puede seguir escribiéndole a los leads desde su ficha."
      />
    )
  }

  // En paralelo: son dos viajes al agente y no dependen entre sí.
  const [ajustes, conversaciones] = await Promise.allSettled([
    obtenerAjustes(),
    obtenerConversaciones(),
  ])

  if (ajustes.status === 'rejected') {
    return (
      <Aviso
        titulo="El agente no respondió"
        detalle={
          ajustes.reason instanceof Error
            ? ajustes.reason.message
            : 'No se pudo contactar al agente de WhatsApp.'
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <EstadoAgente qr={qr} pausado={ajustes.value.settings.paused === '1'} />
      <PanelConversaciones
        inicial={conversaciones.status === 'fulfilled' ? conversaciones.value : []}
      />
      <PanelAjustes inicial={ajustes.value.settings} />
    </div>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">{children}</div>
}

function Aviso({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg p-4"
      style={{ border: '1px solid var(--tx-border)', background: 'var(--tx-surface-1)' }}
    >
      <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[var(--tx-warning)]" />
      <div>
        <p className="text-sm font-medium text-[var(--tx-ink-primary)]">{titulo}</p>
        <p className="mt-0.5 max-w-prose text-xs text-[var(--tx-ink-muted)]">{detalle}</p>
      </div>
    </div>
  )
}
