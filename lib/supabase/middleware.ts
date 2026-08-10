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
  // El fusible de entorno importa: `BYPASS_AUTH` apaga la autenticación entera.
  // En Vercel es fácil marcar las tres casillas al crear una variable y dejarla
  // también en producción; sin esta condición, eso abre el CRM a cualquiera que
  // pase por la URL, haciéndose pasar por el superadmin.
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
    pathname.startsWith('/recuperar') ||          // pedir el link de contraseña nueva
    pathname.startsWith('/auth/confirmar') ||     // canje del token del correo
    pathname.startsWith('/api/auth/recuperar') ||
    pathname.startsWith('/api/invitaciones/') ||  // validación de token no requiere sesión
    // Se autentica con `Authorization: Bearer <token de agente>`, no con sesión de
    // navegador: acá entran Jarvis, Ariel y Spike, que corren como servicios. Sin
    // esta línea el middleware los rebota a /login y la ruta NUNCA llega a ejecutarse
    // — por eso el canal de agentes existe desde la 024 y jamás se pudo usar.
    // "Pública" acá solo significa que el middleware la deja pasar: la ruta valida el
    // token por su cuenta (hash + comparación en tiempo constante) y sin uno válido
    // responde 401. Va solo `/mensajes`: el alta de agentes (POST /api/agentes) sigue
    // exigiendo sesión de admin, que es la que reparte llaves nuevas.
    pathname.startsWith('/api/agentes/mensajes')

  // /nueva-password queda deliberadamente FUERA de las públicas: se llega con la
  // sesión de recuperación ya abierta, así que necesita sesión. Si estuviera en la
  // lista, la regla de "usuario logueado en ruta pública → dashboard" de más abajo
  // lo rebotaría justo cuando acaba de canjear el link.
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Sesión viva, pero la persona ya no es del equipo ────────────────────────
  // Hasta acá el middleware solo comprobaba que EXISTIERA sesión. A un integrante
  // dado de baja eso lo dejaba entrar a /(app): veía el cascarón de la app con
  // todo vacío (la RLS le niega los datos) y no entendía por qué. Un "no puedes
  // entrar" es una respuesta; una app en blanco es un bug a los ojos de quien la
  // mira.
  //
  // Sobre el costo, que es la parte incómoda: esto es una consulta a la base y el
  // middleware corre en cada request. Se acota a lo que de verdad la necesita.
  //
  //   · Rutas públicas y usuarios sin sesión: ya salieron por los returns de
  //     arriba, no llegan acá.
  //   · Las /api/* se saltan: cada handler ya resuelve al integrante con
  //     `IntegrantesRepository.getByAuthUser()`, que filtra `activo = true` y
  //     responde 403. Consultar acá sería pagar dos veces por la misma respuesta.
  //   · Los assets ya están excluidos por el matcher de proxy.ts.
  //
  // Queda entonces una consulta por navegación de página, sobre un índice, en un
  // request que YA hace una llamada de red a Supabase (`auth.getUser()`). El
  // agregado es marginal frente a lo que el middleware ya gastaba.
  //
  // Se evaluó cachear el veredicto en una cookie con TTL y se descartó: la cookie
  // la controla el cliente, así que el revocado podría congelarla y estirar su
  // acceso indefinidamente. Firmarla exigiría un secreto nuevo en el entorno —
  // una variable más que puede faltar en un deploy y romper el login de todos.
  // Para una revocación, un caché que el revocado puede manipular no es un caché:
  // es el agujero otra vez.
  //
  // Y el caso normal ni siquiera llega hasta acá: /api/admin/acceso borra las
  // sesiones de auth al revocar, así que `getUser()` de más arriba ya falla y la
  // persona sale por la rama de `!user`. Esta consulta cubre el resto — un
  // `activo = false` puesto a mano en la base, o una revocación que quedó a medias.
  //
  // BYPASS_AUTH se salta la comprobación: su usuario es inventado y puede no tener
  // fila en la base de desarrollo. Comprobarlo convertiría el bypass en un candado.
  const esRutaApi = pathname.startsWith('/api/')
  let tieneAcceso = true

  if (user && !bypass && !esRutaApi) {
    // Query suelta y no un repo de lib/repos/ a propósito: acá hace falta el
    // cliente ligado a las cookies de ESTE request, y los repos se construyen
    // sobre lib/supabase/server.ts, que usa `cookies()` de next/headers —
    // inalcanzable desde el middleware.
    const { data: integrante } = await supabase
      .from('dim_integrantes')
      .select('activo')
      .eq('auth_user_id', user.id)
      // El tipo de fila se declara acá porque `lib/types/database.ts` está escrito a
      // mano y va por detrás del esquema real; sin esto la inferencia colapsa a
      // `never`. Es la misma razón por la que los repos usan un escape parecido.
      .maybeSingle<{ activo: boolean }>()

    // `!integrante` cuenta como fuera: es alguien con cuenta de Supabase que
    // nunca fue del equipo. La policy "leer propio registro" le deja ver su
    // propia fila aunque esté inactivo, así que si no hay fila es que no existe.
    tieneAcceso = Boolean(integrante?.activo)
  }

  // El orden de estas dos reglas es lo que evita un bucle de redirecciones.
  //
  // Si la comprobación de acceso fuera después de "usuario logueado en ruta
  // pública → dashboard", un revocado con la sesión todavía viva (activo = false
  // pero sin sesiones borradas) rebotaría para siempre: /login → dashboard →
  // /login → dashboard. Mandándolo a /login ANTES de esa regla, y dejando que la
  // regla solo se aplique a quien sí tiene acceso, la cadena termina.
  if (user && !tieneAcceso) {
    if (isPublicRoute) return supabaseResponse // ya está en /login: se le deja ver el formulario

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // El motivo viaja en la URL para que /login pueda decir algo mejor que un
    // formulario vacío. Sin esto, a la persona la rebotan sin explicación y
    // vuelve a intentar con la misma contraseña, que es correcta.
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
