import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Cron: cierra llamadas zombis en toda la base, no solo las de una
 * conversación puntual.
 *
 * `LlamadasRepository.viva()` ya barre zombis, pero solo de la conversación
 * que alguien está mirando en ese momento — si nadie vuelve a abrir un hilo,
 * una llamada colgada ahí (navegador cerrado a mitad de la llamada, o
 * timbrando sin que nadie conteste) se queda sin terminar para siempre.
 * Bug reportado: "varias llamadas quedan en cola, a pesar de haber sido
 * finalizadas".
 */
export async function GET(req: Request) {
  // Mismo criterio que cron/avisos y cron/google-watch: sin CRON_SECRET
  // definido se cierra, no se abre.
  const secreto = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secreto || auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('cerrar_llamadas_zombis_global')

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: { cerradas: data } })
}
