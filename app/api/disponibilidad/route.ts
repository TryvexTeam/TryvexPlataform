import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DisponibilidadRepository } from '@/lib/repos/disponibilidad'
import { DisponibilidadPutSchema } from '@/lib/types/disponibilidad'
import { revalidarEnLanding } from '@/lib/revalidate-landing'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const repo = new DisponibilidadRepository(supabase)
  const data = await repo.listAll(user.id)
  return NextResponse.json({ success: true, data })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 })

  const result = DisponibilidadPutSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const repo = new DisponibilidadRepository(supabase)
  const integranteId = await repo.integranteIdDe(user.id)
  if (!integranteId) {
    return NextResponse.json({ success: false, error: 'No eres integrante activo' }, { status: 403 })
  }

  // El interruptor primero: si la grilla se guarda y esto falla, quedarían
  // horas marcadas como públicas con el maestro apagado — inofensivo pero
  // mentiroso en pantalla. Al revés, si falla la grilla, el maestro encendido
  // sin celdas públicas no publica nada.
  if (result.data.recibe_citas !== undefined) {
    await repo.setRecibeCitas(integranteId, result.data.recibe_citas)
  }

  await repo.replaceOwn(integranteId, result.data.celdas)

  /* Avisar a la landing que sus horas cambiaron.
     Sin esto, quien acaba de marcar sus horas ve el formulario de tryvex.tech
     diciendo «no queda ninguna hora libre» hasta diez minutos después —cinco
     del caché del CRM y cinco del de la landing— y concluye, con razón, que no
     funcionó. Pasó exactamente así la primera vez que se encendió.

     Se espera el resultado en vez de dispararlo y olvidarlo: en una función
     serverless, una promesa suelta puede morir cuando la respuesta se envía y
     el aviso no llegaría nunca. Y no puede tumbar el guardado — la propia
     función se traga sus errores. */
  await revalidarEnLanding('disponibilidad')

  return NextResponse.json({ success: true })
}
