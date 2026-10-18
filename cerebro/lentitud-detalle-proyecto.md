# La espera al abrir el detalle de un proyecto — resuelto

> 2026-08-19. **Cerrado.** Causa encontrada y corregida en el PR #105,
> verificado en el preview de Vercel.

## El síntoma

Al entrar a un proyecto, la pantalla se quedaba vacía hasta medio minuto y de
golpe aparecía todo. Desde cualquier ruta, no solo desde el chat, y de forma
intermitente.

## La causa

**El contenido llegaba bien. Lo que fallaba era que se mostrara.**

Medido en producción: el detalle del proyecto entra al DOM a los **1.002 ms**, y
la capa de `PageTransition` sigue en **`opacity: 0`** en diez muestras
consecutivas, más allá de los 5,5 s. Dentro de esa capa invisible ya estaban las
seis tarjetas y el texto completo.

`<AnimatePresence mode="wait">` hace que la entrada de la página nueva espere a
que la anterior termine de salir. En el App Router, el router desmonta el
contenido viejo y monta el nuevo por su cuenta, sin avisar a Framer Motion: la
salida nunca llega a ejecutarse, la entrada se queda esperándola, y el elemento
nuevo se queda plantado en su estado inicial.

Es un problema conocido: [vercel/next.js#59349](https://github.com/vercel/next.js/discussions/59349),
más las guías de [LogRocket](https://blog.logrocket.com/advanced-page-transitions-next-js-framer-motion/)
y [Glance](https://glance.thyonix.com/blog/nextjs-page-transitions-app-router),
que describen el mismo mecanismo y el mismo "stuck at opacity 0".

Por qué encajaba todo:

- **Recargar funcionaba siempre**: en una carga completa no hay página saliente
  que esperar. Este fue el dato que señaló dónde mirar.
- **Solo al cambiar de ruta**: es cuando `AnimatePresence` orquesta salida y
  entrada.
- **Se notaba más en un proyecto**: su contenido tarda más en llegar del
  servidor, así que la desincronización es mayor. La animación depende de que la
  base ya haya respondido.
- **Intermitente**: según si la salida alcanzaba a completarse antes de que
  llegara el contenido.

## El arreglo (PR #105)

La animación de página pasa a CSS. No hay nada que orquestar: arranca sola al
montarse el elemento y termina sola, así que el peor caso posible es que no se
anime, nunca que la página no se vea. Se pierde la animación de salida, que en
el App Router no llegaba a verse igualmente.

## Lo que se descartó por el camino, con números

| Qué se midió | Resultado | Conclusión |
|---|---|---|
| Consulta de tareas (`EXPLAIN ANALYZE`) | 0,18 ms, usa `tareas_proyecto_idx` | La base nunca fue el cuello |
| Función `/proyectos/[id]` en Vercel | 316 ms | El servidor responde bien |
| Middleware | 574 ms | Caro, pero lejos del síntoma |
| Respuesta completa en Vercel | 1,2 s | Entrega rápida |
| `/login` en producción | 0,22–0,54 s | Plataforma sana |
| Región de base y función | ambas en us-east-1 | Sin viaje entre continentes |
| Entrar al proyecto, midiendo el DOM | ~300 ms | **Engañoso: medía el DOM, no lo visible** |

Falsas pistas: las consultas repetidas cada 45 s son el repaso deliberado de
`useDatosVivos`; la ambigüedad de claves foráneas de PostgREST no afectaba a
esta página; la animación de entrada de las tarjetas dura ~0,2 s; el tablero no
tiene guarda de montaje.

## Las tres lecciones

1. **Medir que un elemento está en el DOM no es medir que se ve.** Durante horas
   las mediciones dieron 300 ms mientras el usuario esperaba 30 segundos, porque
   se comprobaba `innerText` y no la opacidad computada. La pregunta correcta
   era "¿lo ve un humano?", no "¿existe el nodo?".
2. **El dato que cerró el caso lo dio el usuario**: *"si recargas funciona
   perfecto, es solo cuando vas de una ruta a otra"*. Esa frase descartó de un
   golpe servidor, base y datos, y dejó una sola familia de causas.
3. **Buscar documentación antes de teorizar.** El problema estaba descrito en la
   discusión oficial de Next.js con el mismo síntoma literal. Media hora de
   hipótesis se habría ahorrado con una búsqueda al principio.

## Cómo entrar a la app para medir, sin credenciales

1. Generar un enlace de recuperación con la API de administración, usando
   `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`:
   `POST {SUPABASE_URL}/auth/v1/admin/generate_link` con
   `{"type":"recovery","email":"<correo del integrante>"}`.
2. Abrir `{app}/auth/confirmar?token_hash=<hashed_token>&type=recovery`. Esa
   ruta ya existe, canjea el token en el servidor y deja la cookie de sesión.
3. No hace falta cambiar la contraseña: la sesión queda abierta igual.

No crea usuarios ni escribe datos. **Borrar el token del disco al terminar.**

`BYPASS_AUTH=true` no sirve: inventa un usuario sin autenticar contra Supabase,
así que la RLS rechaza todo con `permission denied for table dim_integrantes`.
Además el middleware solo lo acepta fuera de producción.

## Sonda para medir esto en el navegador de cualquiera

Pegar en la consola, navegar, y leer la línea roja de cada entrada:

```js
(() => {
  let t0 = performance.now(), esperando = false, ruta = location.pathname
  const revisar = () => {
    if (location.pathname !== ruta) {
      ruta = location.pathname
      if (ruta.startsWith('/proyectos/')) { t0 = performance.now(); esperando = true }
    }
    const capa = document.querySelector('main div.h-full')
    const visible = capa && Number(getComputedStyle(capa).opacity) > 0.9
    if (esperando && visible && document.body.innerText.includes('Costo total')) {
      esperando = false
      console.log('%c VISIBLE EN ' + Math.round(performance.now() - t0) + ' ms ',
        'background:#e8352a;color:#fff;font-size:14px')
    }
    requestAnimationFrame(revisar)
  }
  revisar()
})()
```

Nótese que comprueba **opacidad**, no solo presencia en el DOM. Ese fue el
error de las primeras mediciones.
