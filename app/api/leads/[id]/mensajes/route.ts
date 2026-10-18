import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MensajesWaRepository } from '@/lib/repos/mensajes-wa'

/**
 * Pasado esto, un mensaje 'encolado' merece una mirada al puente. Se mide desde
 * `created_at` porque la tabla no guarda cuándo cambió de estado; por eso el
 * margen es amplio: el puente toma uno cada 10 s, así que en 10 min alcanza a
 * tomar unos 60 de una ráfaga. Y el texto sugiere revisar, no afirma que está
 * caído.
 *
 * A 'enviando' NO se le aplica: ya fue tomado y espera turno en la cola del
 * puente (uno por minuto), y desde `created_at` no hay cómo distinguir eso de
 * un envío trabado. Inferirlo empujaría a reenviar —y a duplicarle el mensaje
 * al cliente— justo lo que se quiere evitar.
 */
const ENCOLADO_REVISAR_MS = 10 * 60 * 1000

function estadoVisible(o: { estado: string; error: string | null; created_at: string }): string {
  if (o.estado === 'fallido') return `no se envió — ${o.error ?? 'sin detalle'}`
  // Sin este aviso, el chat decía "encolado" durante horas y el equipo esperaba
  // un mensaje que no iba a salir hasta que alguien reconectara el puente.
  if (o.estado === 'encolado' && Date.now() - new Date(o.created_at).getTime() > ENCOLADO_REVISAR_MS) {
    return 'en cola hace más de 10 min — si sigue así, revisá que el puente de WhatsApp esté conectado'
  }
  return o.estado
}

/**
 * GET /api/leads/[id]/mensajes
 * Hilo de WhatsApp del lead (tabla `mensajes_wa`), orden cronológico.
 * Lee a través de `MensajesWaRepository` (capa de datos del wa-bridge), así la
 * vista no duplica queries: cuando el puente empieza a poblar la tabla, este
 * endpoint ya la sirve sin cambios.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })
  }

  const { id } = await params

  try {
    const repo = new MensajesWaRepository(supabase)
    const mensajes = await repo.hiloPorLead(id)

    // Los envíos que todavía no salieron —o que murieron— viven en
    // `outreach_messages`, NO en `mensajes_wa`: el puente escribe en la segunda
    // recién cuando el mensaje salió de verdad.
    //
    // Sin esto el chat se los traga. Pasó el 17-ago: el equipo apretaba Enviar,
    // veía "Mensaje encolado", el puente lo bloqueaba, y el mensaje simplemente
    // no aparecía nunca. Quedaron esperando sin saber que había muerto.
    const { data: enVuelo } = await supabase
      .from('outreach_messages')
      .select('id, texto, estado, error, created_at')
      .eq('lead_id', id)
      .eq('canal', 'whatsapp')
      .in('estado', ['encolado', 'enviando', 'fallido'])
      .order('created_at', { ascending: true })

    const pendientes = (enVuelo ?? []).map(
      (o: { id: string; texto: string; estado: string; error: string | null; created_at: string }) => ({
        id: `outreach:${o.id}`,
        direccion: 'out' as const,
        texto: o.texto,
        es_bot: false,
        enviado_por: null,
        // Lo que la persona necesita saber de un vistazo: si va en camino o si
        // se cayó, y por qué.
        estado_envio: estadoVisible(o),
        created_at: o.created_at,
      })
    )

    const todo = [...mensajes, ...pendientes].sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at))
    )

    return NextResponse.json({ success: true, data: todo })
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json(
      { success: false, error: `No se pudo leer el hilo: ${detail}` },
      { status: 500 }
    )
  }
}
