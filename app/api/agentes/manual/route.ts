import { NextResponse } from 'next/server'
import { autenticarAgente } from '@/lib/agentes/autenticar'
import { CICLO_RECOMENDADO, REGLAS_GENERALES, RUTAS } from '@/lib/agentes/manual'

/**
 * "¿Quién soy y qué puedo hacer?"
 *
 *   GET /api/agentes/manual
 *
 * La primera llamada que debería hacer cualquier agente. Devuelve su identidad
 * (para no responderse a sí mismo en el canal, entre otras cosas) y el manual
 * completo de la API en un formato que una IA lee sin esfuerzo. Así un agente
 * nuevo se conecta sin que nadie le explique nada: le basta el token.
 */
export async function GET(req: Request) {
  const auth = await autenticarAgente(req)
  if ('error' in auth) return auth.error

  return NextResponse.json({
    success: true,
    agente: auth.agente,
    base: new URL(req.url).origin,
    reglas: REGLAS_GENERALES,
    ciclo: CICLO_RECOMENDADO,
    rutas: RUTAS,
    documentacion: 'docs/API-AGENTES-INTELLIGENCE.md en el repositorio TryvexPlataform',
  })
}
