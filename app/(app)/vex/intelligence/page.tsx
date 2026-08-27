import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Brain, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { IntegrantesRepository } from '@/lib/repos/integrantes'
import { obtenerAjustes, obtenerConversaciones, agenteConfigurado } from '@/lib/vex/agente'
import { obtenerEstadoQr } from '@/lib/wa/qr'
import { PanelAjustes } from '@/components/vex/intelligence/panel-ajustes'
import { PanelConversaciones } from '@/components/vex/intelligence/panel-conversaciones'
import { EstadoAgente } from '@/components/vex/intelligence/estado-agente'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Tryvex Intelligence',
}

/**
 * Tryvex Intelligence — el puesto de control del agente, dentro del CRM.
 *
 * El agente tiene su propio panel, pero el equipo trabaja acá: es donde está la
 * ficha del lead, su historial y el pipeline. Una conversación de WhatsApp sin
 * ese contexto al lado vale la mitad.
 *
 * Todo se resuelve en el servidor para que la pantalla llegue con datos y no con
 * esqueletos: el token del agente no sale de acá.
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
          detalle="Operar el agente puede cambiar lo que se le responde a los leads, así que hace falta un perfil de integrante activo."
        />
      </Marco>
    )
  }

  if (!agenteConfigurado()) {
    return (
      <Marco>
        <Aviso
          titulo="El agente todavía no está conectado"
          detalle="Faltan VEX_AGENT_URL y VEX_AGENT_TOKEN en el entorno del CRM. Mientras tanto, el equipo puede seguir escribiéndole a los leads desde su ficha."
        />
      </Marco>
    )
  }

  // En paralelo: son tres viajes al agente y no dependen entre sí.
  const [ajustes, conversaciones, qr] = await Promise.allSettled([
    obtenerAjustes(),
    obtenerConversaciones(),
    obtenerEstadoQr(),
  ])

  // Si el agente no responde, se dice qué pasó en vez de mostrar una pantalla
  // vacía: un panel sin datos y sin explicación manda a revisar el lugar
  // equivocado.
  if (ajustes.status === 'rejected') {
    return (
      <Marco>
        <Aviso
          titulo="El agente no respondió"
          detalle={
            ajustes.reason instanceof Error
              ? ajustes.reason.message
              : 'No se pudo contactar al agente de WhatsApp.'
          }
        />
      </Marco>
    )
  }

  return (
    <Marco>
      <EstadoAgente
        qr={qr.status === 'fulfilled' ? qr.value : { estado: 'sin_respuesta' }}
        pausado={ajustes.value.settings.paused === '1'}
      />

      <PanelConversaciones
        inicial={conversaciones.status === 'fulfilled' ? conversaciones.value : []}
      />

      <PanelAjustes inicial={ajustes.value.settings} />
    </Marco>
  )
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/vex"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-[var(--tx-ink-muted)] hover:text-[var(--tx-ink-primary)] transition-colors"
        >
          <ArrowLeft size={13} />
          Volver a Vex
        </Link>
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-[var(--tx-accent)]" />
          <h1 className="text-xl font-semibold text-[var(--tx-ink-primary)]">
            Tryvex Intelligence
          </h1>
        </div>
        <p className="text-sm text-[var(--tx-ink-secondary)] max-w-prose">
          Cómo trabaja el agente cuando un lead responde. Los cambios tienen efecto en la
          conversación siguiente, sin reiniciar nada.
        </p>
      </header>

      {children}
    </div>
  )
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
        <p className="mt-0.5 text-xs text-[var(--tx-ink-muted)] max-w-prose">{detalle}</p>
      </div>
    </div>
  )
}
