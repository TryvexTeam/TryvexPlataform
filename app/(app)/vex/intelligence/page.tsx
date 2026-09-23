import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { obtenerAjustes, obtenerConversaciones, agenteConfigurado } from '@/lib/vex/agente'
import { obtenerEstadoQr } from '@/lib/wa/qr'
import { PanelAjustes } from '@/components/vex/intelligence/panel-ajustes'
import { PanelConversaciones } from '@/components/vex/intelligence/panel-conversaciones'
import { EstadoAgente } from '@/components/vex/intelligence/estado-agente'
import { PanelIntelligence } from '@/components/vex/intelligence/panel-intelligence'
import { obtenerAgentesReales, obtenerEncargosReales } from '@/lib/repos/intelligence-real'
import { encolarEncargo, aprobarEncargo, rechazarEncargo, archivarEncargo } from './acciones'
import {
  CAMPANAS_EJEMPLO,
  CANALES_EJEMPLO,
  CONVERSACIONES_EJEMPLO,
  COSTOS_EJEMPLO,
  DOCUMENTOS_EJEMPLO,
  HERRAMIENTAS_EJEMPLO,
  HILO_EJEMPLO,
  METRICAS_EJEMPLO,
  RUTINAS_EJEMPLO,
  TRASPASOS_EJEMPLO,
} from '@/lib/vex/sala-ejemplo'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tryvex Intelligence',
}

/**
 * Tryvex Intelligence — la sala donde trabajan los agentes del equipo.
 *
 * Qué cambió y por qué: antes esta pantalla era SOLO el puesto de control del
 * agente de WhatsApp. Ese panel sigue vivo y sin tocar —el equipo lo usa en
 * producción—, pero pasó a ser una de tres vistas. Las otras dos son la sala de
 * agentes y el espacio de cada uno, que es a donde va a ir creciendo todo lo
 * demás: rutinas, herramientas, base de conocimiento, campañas y costos.
 *
 * El panel de WhatsApp se resuelve acá, en el servidor, y baja como `children`:
 * el token del agente no puede llegar al navegador.
 */
export default async function TryvexIntelligencePage() {
  const supabase = await createClient()

  // Mismo atajo que el layout: en desarrollo con BYPASS_AUTH no hay sesión, y
  // esta comprobación mandaba a /login. Como el middleware con el atajo ve un
  // usuario válido, rebotaba al panel: la pantalla se expulsaba sola en bucle.
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

  // Los agentes y su cola salen de la base. El resto de las pantallas todavía
  // no tiene tabla, y se sigue marcando como vista de diseño para que nadie
  // confunda una maqueta con su cartera real.
  // Mismo fusible que el layout: en desarrollo con BYPASS_AUTH no hay sesión, y
  // sin sesión las políticas de la base no dejan leer nada. Fuera de desarrollo
  // `bypass` es false y esto es exactamente el cliente de siempre.
  const datos = bypass ? createAdminClient() : supabase
  const { agentes, encargos: colaReal } = await obtenerAgentesReales(datos)

  return (
    <PanelIntelligence
      agentes={agentes}
      cola={colaReal}
      recargarCola={async () => {
        'use server'
        const cliente = bypass ? createAdminClient() : await createClient()
        return obtenerEncargosReales(cliente)
      }}
      alEncolar={encolarEncargo}
      alAprobar={aprobarEncargo}
      alRechazar={rechazarEncargo}
      alArchivar={archivarEncargo}
      encargos={[]}
      hilo={HILO_EJEMPLO}
      rutinas={RUTINAS_EJEMPLO}
      herramientas={HERRAMIENTAS_EJEMPLO}
      conversaciones={CONVERSACIONES_EJEMPLO}
      costos={COSTOS_EJEMPLO}
      canales={CANALES_EJEMPLO}
      documentos={DOCUMENTOS_EJEMPLO}
      traspasos={TRASPASOS_EJEMPLO}
      metricas={METRICAS_EJEMPLO}
      campanas={CAMPANAS_EJEMPLO}
      panelWhatsapp={await PanelDeWhatsapp()}
    />
  )
}

/**
 * El panel de siempre: estado del número, conversaciones y ajustes.
 *
 * Devuelve el aviso correspondiente cuando el agente no está configurado o no
 * responde, en vez de una pantalla vacía: un panel sin datos y sin explicación
 * manda a revisar el lugar equivocado.
 */
async function PanelDeWhatsapp() {
  if (!agenteConfigurado()) {
    return (
      <Aviso
        titulo="El agente de WhatsApp todavía no está conectado"
        detalle="Faltan VEX_AGENT_URL y VEX_AGENT_TOKEN en el entorno del CRM. Mientras tanto, el equipo puede seguir escribiéndole a los leads desde su ficha."
      />
    )
  }

  // En paralelo: son tres viajes al agente y no dependen entre sí.
  const [ajustes, conversaciones, qr] = await Promise.allSettled([
    obtenerAjustes(),
    obtenerConversaciones(),
    obtenerEstadoQr(),
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
      <EstadoAgente
        qr={qr.status === 'fulfilled' ? qr.value : { estado: 'sin_respuesta' }}
        pausado={ajustes.value.settings.paused === '1'}
      />
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
