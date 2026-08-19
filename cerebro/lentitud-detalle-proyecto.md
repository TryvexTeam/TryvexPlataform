# Investigación: la espera al abrir el detalle de un proyecto

> 2026-08-19. Abierta — falta el dato que la cierra. Ver "Qué falta" al final.

## El síntoma, según quien lo sufre

Al entrar a un proyecto, el tablero tarda **más de medio minuto** en mostrar
sus tarjetas. Pasa desde cualquier ruta, no solo desde el chat, y se repite:
no es solo la primera vez tras un despliegue.

Un matiz que llegó tarde y que cambia dónde hay que mirar: **lo que tarda no es
llegar a la pantalla, son las tarjetas del pipeline**. La ruta abre; lo que se
hace esperar es el contenido del tablero.

## Lo que se descartó, con números

| Qué se midió | Resultado | Conclusión |
|---|---|---|
| Consulta de tareas del proyecto (`EXPLAIN ANALYZE`) | 0,18 ms, usa `tareas_proyecto_idx` | La base no es el cuello |
| Función `/proyectos/[id]` en Vercel | 316 ms | El servidor responde bien |
| Middleware | 574 ms | Caro, pero lejos de 30 s |
| Respuesta completa en Vercel | 1,2 s | El servidor entrega rápido |
| `/login` en producción, 3 intentos | 0,22–0,54 s | La plataforma está sana |
| Región de base y función | ambas en us-east-1 | No hay viaje entre continentes |
| Entrar al proyecto en local (12 vueltas) | mediana 1,07 s | Estable |
| Entrar al proyecto en producción (6 vueltas) | 886–1.098 ms | Estable |

**Nada de esto reprodujo los 30 segundos.** El único pico observado —20,7 s en
local— apareció una sola vez y se explica por la compilación bajo demanda del
modo desarrollo, que no existe en producción.

Aviso sobre esas dos últimas filas: la medición esperaba a que apareciera el
título de la columna **"Backlog"**, no las tarjetas. Como el síntoma real son
las tarjetas, esos números dicen "la pantalla llega en ~1 s" pero **no** miden
lo que el usuario está esperando. Hay que rehacerlas esperando el título de una
tarea concreta.

## Falsas pistas descartadas

- **Las consultas repetidas cada ~45 s** que aparecen en los logs de Supabase no
  son un bucle: son el repaso de `useDatosVivos` (`lib/hooks/use-datos-vivos.ts`),
  una red de seguridad deliberada por si el tiempo real falla en silencio. Solo
  corre con la pestaña visible.
- **Otro integrante conectado**: descartado, las consultas llevan el id del
  proyecto que estaba abierto.
- **Ambigüedad de claves foráneas en PostgREST** (antecedente real en este
  repo): las FK añadidas en el #103 no afectan a las consultas de esta página.
- **La animación de entrada de las tarjetas**: `staggerChildren` de 0,03 s con
  muelle 350/25. Con seis tareas son ~0,2 s.
- **Guarda de montaje en el tablero**: no existe; el tablero no espera a
  hidratar para pintarse.

## Lo que sí se corrigió por el camino

`app/(app)/layout.tsx` hacía **cuatro idas a la base encadenadas** en cada
navegación y en cada refresco automático, y dos de ellas pedían la **misma
fila** de `dim_integrantes`. Quedó en `getUser` más dos consultas en paralelo
(PR #104, ya en `main`). El señor Ignacio notó mejora tras desplegarlo.

Es una mejora buena por sí misma, pero **no es el arreglo del síntoma**: actúa
sobre los ~900 ms de servidor, y la espera que se ve son decenas de segundos.

## Sospechas vivas, por orden

1. **Las tarjetas, no la ruta.** Medir hasta que aparezca el texto de una tarea
   real. Si la pantalla llega en 1 s y las tarjetas en 30, el problema está
   entre la hidratación de `TareasKanban` y el primer pintado de las tarjetas.
2. **Peso del JS.** 466 KB en 36 archivos en esa pantalla; el tablero arrastra
   dnd-kit y framer-motion. En un equipo cargado, parsear y ejecutar eso puede
   dominar el tiempo. El LCP medido por el usuario fue 20,61 s con INP de 56 ms:
   responde bien una vez está, lo que tarda es llegar a pintarlo.
3. **`router.refresh()` y la caché del router.** El repaso de 45 s invalida la
   caché del router de Next, así que volver a una ruta nunca se sirve de caché
   y siempre va al servidor.

## Qué falta para cerrarla

Una de estas dos, y basta:

- **Del navegador de quien lo sufre**, cuando esté ocurriendo: F12 → Network →
  ordenar por Time → nombre y duración de la fila de arriba. Distingue de
  inmediato entre esperar el documento, esperar un `.js` o una petición colgada.
- **Una grabación de la pestaña Performance** durante la espera, que diría si el
  hilo principal está bloqueado.

## Cómo entrar a la app para medir, sin credenciales

Sirve para reproducir en local o en producción sin pedir contraseñas:

1. Generar un enlace de recuperación con la API de administración, usando
   `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`:
   `POST {SUPABASE_URL}/auth/v1/admin/generate_link` con
   `{"type":"recovery","email":"<correo del integrante>"}`.
2. Abrir `{app}/auth/confirmar?token_hash=<hashed_token>&type=recovery`. Esa
   ruta ya existe, canjea el token en el servidor y deja la cookie de sesión.
3. No hace falta cambiar la contraseña: la sesión queda abierta igual.

No crea usuarios ni escribe datos. **Borrar el token del disco al terminar.**

`BYPASS_AUTH=true` no sirve para esto: inventa un usuario sin autenticar contra
Supabase, así que la RLS rechaza todas las consultas con
`permission denied for table dim_integrantes`. Además el middleware solo lo
acepta fuera de producción, así que `next start` lo ignora.
