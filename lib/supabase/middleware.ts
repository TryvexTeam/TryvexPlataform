import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/types/database'

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[middleware] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  // El fusible de entorno importa: `BYPASS_AUTH` apaga la autenticaciÃ³n entera.
  // En Vercel es fÃ¡cil marcar las tres casillas al crear una variable y dejarla
  // tambiÃ©n en producciÃ³n; sin esta condiciÃ³n, eso abre el CRM a cualquiera que
  // pase por la URL, haciÃ©ndose pasar por el superadmin.
  let bypass = false
  if (process.env.NODE_ENV !== 'production' && process.env.BYPASS_AUTH === 'true') {
    bypass = true
    user = { id: '1230b7c1-8086-4f14-b6b1-2afa9deb56ae', email: 'ignacio.andres.navarrete.silva@gmail.com' }
  } else {
    const res = await supabase.auth.getUser()
    user = res.data.user
  }

  const { pathname } = request.nextUrl
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/recuperar') ||          // pedir el link de contraseÃ±a nueva
    pathname.startsWith('/auth/confirmar') ||     // canje del token del correo
    pathname.startsWith('/api/auth/recuperar') ||
    // Solo la validaciÃ³n del TOKEN (GET/PATCH /api/invitaciones/<token>) no
    // requiere sesiÃ³n. `/pendientes` y `<id>/aprobar` viven bajo el mismo
    // prefijo pero son del panel de aprobaciÃ³n (superadmin autenticado): sin
    // estas dos exclusiones, la regla de "logueado en ruta pÃºblica â†’
    // dashboard" de mÃ¡s abajo rebotaba a cualquier superadmin autenticado
    // antes de que la ruta llegara a correr.
    (pathname.startsWith('/api/invitaciones/') &&
      pathname !== '/api/invitaciones/pendientes' &&
      !pathname.endsWith('/aprobar')) ||
    // Se autentica con `Authorization: Bearer <token de agente>`, no con sesiÃ³n de
    // navegador: acÃ¡ entran Jarvis, Ariel y Spike, que corren como servicios. Sin
    // esta lÃ­nea el middleware los rebota a /login y la ruta NUNCA llega a ejecutarse
    // â€” por eso el canal de agentes existe desde la 024 y jamÃ¡s se pudo usar.
    // "PÃºblica" acÃ¡ solo significa que el middleware la deja pasar: la ruta valida el
    // token por su cuenta (hash + comparaciÃ³n en tiempo constante) y sin uno vÃ¡lido
    // responde 401. Va solo `/mensajes`: el alta de agentes (POST /api/agentes) sigue
    // exigiendo sesiÃ³n de admin, que es la que reparte llaves nuevas.
    pathname.startsWith('/api/agentes/') ||
    // Mismo caso que `/api/agentes/`: lo llama el SERVIDOR de tryvex.tech con
    // `x-landing-token`, no un navegador con sesión. Sin esta línea el
    // middleware lo rebota a /login con un 307 y el handler nunca corre — que
    // es exactamente lo que pasó la primera vez que se probó la ruta.
    // "Pública" acá solo significa que el middleware la deja pasar: cada
    // handler bajo este prefijo valida el token por su cuenta, en tiempo
    // constante, y sin uno válido responde 401.
    pathname.startsWith('/api/publico/')

  // /nueva-password queda deliberadamente FUERA de las pÃºblicas: se llega con la
  // sesiÃ³n de recuperaciÃ³n ya abierta, asÃ­ que necesita sesiÃ³n. Si estuviera en la
  // lista, la regla de "usuario logueado en ruta pÃºblica â†’ dashboard" de mÃ¡s abajo
  // lo rebotarÃ­a justo cuando acaba de canjear el link.
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // â”€â”€ SesiÃ³n viva, pero la persona ya no es del equipo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Hasta acÃ¡ el middleware solo comprobaba que EXISTIERA sesiÃ³n. A un integrante
  // dado de baja eso lo dejaba entrar a /(app): veÃ­a el cascarÃ³n de la app con
  // todo vacÃ­o (la RLS le niega los datos) y no entendÃ­a por quÃ©. Un "no puedes
  // entrar" es una respuesta; una app en blanco es un bug a los ojos de quien la
  // mira.
  //
  // Sobre el costo, que es la parte incÃ³moda: esto es una consulta a la base y el
  // middleware corre en cada request. Se acota a lo que de verdad la necesita.
  //
  //   Â· Rutas pÃºblicas y usuarios sin sesiÃ³n: ya salieron por los returns de
  //     arriba, no llegan acÃ¡.
  //   Â· Las /api/* se saltan: cada handler ya resuelve al integrante con
  //     `IntegrantesRepository.getByAuthUser()`, que filtra `activo = true` y
  //     responde 403. Consultar acÃ¡ serÃ­a pagar dos veces por la misma respuesta.
  //   Â· Los assets ya estÃ¡n excluidos por el matcher de proxy.ts.
  //
  // Queda entonces una consulta por navegaciÃ³n de pÃ¡gina, sobre un Ã­ndice, en un
  // request que YA hace una llamada de red a Supabase (`auth.getUser()`). El
  // agregado es marginal frente a lo que el middleware ya gastaba.
  //
  // Se evaluÃ³ cachear el veredicto en una cookie con TTL y se descartÃ³: la cookie
  // la controla el cliente, asÃ­ que el revocado podrÃ­a congelarla y estirar su
  // acceso indefinidamente. Firmarla exigirÃ­a un secreto nuevo en el entorno â€”
  // una variable mÃ¡s que puede faltar en un deploy y romper el login de todos.
  // Para una revocaciÃ³n, un cachÃ© que el revocado puede manipular no es un cachÃ©:
  // es el agujero otra vez.
  //
  // Y el caso normal ni siquiera llega hasta acÃ¡: /api/admin/acceso borra las
  // sesiones de auth al revocar, asÃ­ que `getUser()` de mÃ¡s arriba ya falla y la
  // persona sale por la rama de `!user`. Esta consulta cubre el resto â€” un
  // `activo = false` puesto a mano en la base, o una revocaciÃ³n que quedÃ³ a medias.
  //
  // BYPASS_AUTH se salta la comprobaciÃ³n: su usuario es inventado y puede no tener
  // fila en la base de desarrollo. Comprobarlo convertirÃ­a el bypass en un candado.
  const esRutaApi = pathname.startsWith('/api/')
  let tieneAcceso = true

  if (user && !bypass && !esRutaApi) {
    // Query suelta y no un repo de lib/repos/ a propÃ³sito: acÃ¡ hace falta el
    // cliente ligado a las cookies de ESTE request, y los repos se construyen
    // sobre lib/supabase/server.ts, que usa `cookies()` de next/headers â€”
    // inalcanzable desde el middleware.
    const { data: integrante } = await supabase
      .from('dim_integrantes')
      .select('activo')
      .eq('auth_user_id', user.id)
      // El tipo de fila se declara acÃ¡ porque `lib/types/database.ts` estÃ¡ escrito a
      // mano y va por detrÃ¡s del esquema real; sin esto la inferencia colapsa a
      // `never`. Es la misma razÃ³n por la que los repos usan un escape parecido.
      .maybeSingle<{ activo: boolean }>()

    // `!integrante` cuenta como fuera: es alguien con cuenta de Supabase que
    // nunca fue del equipo. La policy "leer propio registro" le deja ver su
    // propia fila aunque estÃ© inactivo, asÃ­ que si no hay fila es que no existe.
    tieneAcceso = Boolean(integrante?.activo)
  }

  // El orden de estas dos reglas es lo que evita un bucle de redirecciones.
  //
  // Si la comprobaciÃ³n de acceso fuera despuÃ©s de "usuario logueado en ruta
  // pÃºblica â†’ dashboard", un revocado con la sesiÃ³n todavÃ­a viva (activo = false
  // pero sin sesiones borradas) rebotarÃ­a para siempre: /login â†’ dashboard â†’
  // /login â†’ dashboard. MandÃ¡ndolo a /login ANTES de esa regla, y dejando que la
  // regla solo se aplique a quien sÃ­ tiene acceso, la cadena termina.
  if (user && !tieneAcceso) {
    if (isPublicRoute) return supabaseResponse // ya estÃ¡ en /login: se le deja ver el formulario

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // El motivo viaja en la URL para que /login pueda decir algo mejor que un
    // formulario vacÃ­o. Sin esto, a la persona la rebotan sin explicaciÃ³n y
    // vuelve a intentar con la misma contraseÃ±a, que es correcta.
    url.searchParams.set('motivo', 'sin_acceso')
    return NextResponse.redirect(url)
  }

  if (user && isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

