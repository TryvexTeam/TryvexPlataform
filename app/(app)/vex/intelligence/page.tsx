import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { obtenerAjustes, obtenerConversaciones, agenteConfigurado } from '@/lib/vex/agente'
import { obtenerEstadoQr } from '@/lib/wa/qr'
import { PanelAjustes } from '@/components/vex/intelligence/panel-ajustes'
import { PanelConversaciones } from '@/components/vex/intelligence/panel-conversaciones'
import { EstadoAgente } from '@/components/vex/intelligence/estado-agente'
import { PanelIntelligence } from '@/components/vex/intelligence/panel-intelligence'
import {
  AGENTES_EJEMPLO,
  ENCARGOS_EJEMPLO,
  HERRAMIENTAS_EJEMPLO,
  HILO_EJEMPLO,
  RUTINAS_EJEMPLO,
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const integrantes = new IntegrantesRepository(supabase)
  const perfil = await integrantes.getByAuthUser(user.id)

  if (!perfil) {
    return (
      <Marco>
        <Aviso
          titulo="Solo para integrantes del equipo"
          detalle="Operar a los agentes puede cambiar lo que se le responde a los leads, así que hace falta un perfil de integrante activo."
        />
      </Marco>
    )
  }

  return (
    <PanelIntelligence
      agentes={AGENTES_EJEMPLO}
      encargos={ENCARGOS_EJEMPLO}
      hilo={HILO_EJEMPLO}
      rutinas={RUTINAS_EJEMPLO}
      herramientas={HERRAMIENTAS_EJEMPLO}
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
