-- Disparar el scraper desde el CRM, con filtros, sin entrar al servidor.
--
-- Hasta hoy el scraper solo corria solo: un timer del VPS lo despertaba a las
-- 07:00 UTC con las 23 categorias fijas. Si alguien del equipo queria leads de
-- un rubro puntual en una comuna puntual, no habia forma -- habia que pedirle a
-- quien tuviera la llave SSH. Esta migracion abre esa puerta.
--
-- == La decision de arquitectura, que es la unica que importa entender =======
--
-- El scraper NO vive en Vercel: vive en un VPS, porque abre un Chromium de
-- verdad y eso no entra en una funcion serverless (ni en memoria, ni en tiempo,
-- ni en la posibilidad de instalar un navegador). O sea que la app y el scraper
-- estan en dos maquinas distintas y hay que comunicarlas.
--
-- El camino obvio seria que la app le pegue por HTTP al VPS. No lo tomamos, y a
-- proposito: eso obliga a exponer un puerto o a colgarse de un tunel de
-- Cloudflare, y esos tuneles CAMBIAN de direccion cada vez que el servicio
-- reinicia (nos mordio dos veces la semana del 8-ago). Cada reinicio del VPS
-- romperia el boton, y el que lo aprieta no tendria como saber por que.
--
-- Asi que se da vuelta: esta tabla es un BUZON. La app no llama a nadie, solo
-- deja escrita una peticion. El VPS la lee cada 15 segundos y la ejecuta. No hay
-- puerto abierto, no hay tunel, no hay direccion que se mueva, y el VPS no
-- necesita ser alcanzable desde afuera. Si el servidor esta apagado cuando
-- alguien aprieta el boton, la corrida no se pierde: queda encolada y arranca
-- cuando vuelve.
--
-- Efecto lateral bueno: la tabla que ya existia para el HISTORIAL (016) y el
-- buzon son la misma cosa. Una fila cuenta la vida completa de una corrida --
-- quien la pidio, con que filtros, como va, y que trajo -- en vez de tener una
-- tabla de pedidos y otra de resultados que despues hay que cruzar.

-- == 1 - La tabla ===========================================================
-- Se crea completa por si la 016 nunca llego a aplicarse (al 9-ago-2026 estaba
-- en main pero NO en la base), y despues se agrega columna por columna por si SI
-- se aplico. De las dos formas queda igual, y se puede correr dos veces sin
-- romper nada.

CREATE TABLE IF NOT EXISTS scraper_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duracion_min      NUMERIC,
  nuevos_leads      INTEGER NOT NULL DEFAULT 0,
  actualizados      INTEGER NOT NULL DEFAULT 0,
  descartados       INTEGER NOT NULL DEFAULT 0,
  total_procesados  INTEGER NOT NULL DEFAULT 0
);

-- Estado: el ciclo de vida completo de una corrida.
--   encolada -> alguien apreto el boton, el VPS todavia no la vio
--   corriendo -> el VPS la tomo y esta trabajando
--   lista     -> termino bien
--   fallida   -> reviento (el motivo queda en `error`)
--   frenada   -> alguien la corto a mitad de camino
--
-- 'lista' por defecto, no 'encolada': las filas que escribe la corrida
-- automatica de las 07:00 se insertan YA terminadas (son telemetria, no
-- pedidos). Si el default fuera 'encolada', cada corrida del timer se
-- reprocesaria sola para siempre.
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'lista';
ALTER TABLE scraper_runs DROP CONSTRAINT IF EXISTS scraper_runs_estado_check;
ALTER TABLE scraper_runs ADD CONSTRAINT scraper_runs_estado_check
  CHECK (estado IN ('encolada', 'corriendo', 'lista', 'fallida', 'frenada'));

-- Los filtros tal cual los eligio la persona. Van en JSON y no en columnas
-- sueltas a proposito: el scraper ya acepta --nicho --comuna --ciudad --region
-- --pais --zoom --cantidad, y manana puede aceptar otro. Si cada filtro fuera
-- una columna, sumar uno nuevo obligaria a una migracion; asi el worker
-- simplemente pasa lo que encuentra.
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS filtros JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Quien la pidio. NULL = la corrida automatica de las 07:00, que no la pide
-- nadie. ON DELETE SET NULL para que borrar a un integrante no borre el
-- historial de lo que trajo.
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS pedida_por UUID
  REFERENCES dim_integrantes(id) ON DELETE SET NULL;

-- Para que el que aprieta el boton vea que pasa algo. Sin esto la pantalla
-- muestra "corriendo" cinco minutos sin mover un pixel y todos piensan que se
-- colgo, aprietan de nuevo, y ahi si se rompe.
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS categoria_actual TEXT;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS categorias_totales INTEGER;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS categorias_hechas INTEGER NOT NULL DEFAULT 0;

-- Pedido de freno. Es un pedido y no una orden: el scraper corta entre
-- categorias, no en medio de una, para no dejar leads a medio escribir.
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS freno_pedido BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS iniciada_at TIMESTAMPTZ;
ALTER TABLE scraper_runs ADD COLUMN IF NOT EXISTS terminada_at TIMESTAMPTZ;

-- == 2 - Una corrida a la vez, garantizado por la base =======================
-- Cada corrida levanta un Chromium en el VPS. Dos en paralelo se comen la RAM y
-- el kernel mata al scraper por OOM -- ya paso, y estuvo 6 dias muriendose
-- todas las mananas sin que nadie lo notara (29-jul al 3-ago-2026).
--
-- Por eso el limite NO vive en la pantalla. Esconder el boton no sirve: dos
-- personas con la pagina abierta al mismo tiempo lo aprietan igual, y no se
-- enteran una de la otra. Este indice hace que la segunda insercion falle sola,
-- venga de donde venga -- de la UI, de un script, o de alguien probando con
-- curl.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraper_runs_una_activa
  ON scraper_runs ((TRUE)) WHERE estado IN ('encolada', 'corriendo');

CREATE INDEX IF NOT EXISTS idx_scraper_runs_fecha ON scraper_runs(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_scraper_runs_estado ON scraper_runs(estado);

-- == 3 - Quien puede que ====================================================
-- Decision de Cristian (9-ago-2026): cualquiera del equipo puede dispararlo, no
-- solo el admin. El limite real es tecnico (una a la vez), no jerarquico.
--
-- INSERT lo hace la persona autenticada: asi `pedida_por` queda amarrado a quien
-- de verdad apreto, y no a la clave de servicio. UPDATE queda SOLO para el
-- server, con dos excepciones que no son excepciones: el freno y nada mas.
-- Nadie desde el navegador puede escribir "trajo 500 leads".

ALTER TABLE scraper_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scraper_runs_select ON scraper_runs;
CREATE POLICY scraper_runs_select ON scraper_runs
  FOR SELECT TO authenticated USING (true);

-- Solo se puede encolar una corrida, nunca insertar una ya terminada, y siempre
-- a nombre propio.
DROP POLICY IF EXISTS scraper_runs_insert ON scraper_runs;
CREATE POLICY scraper_runs_insert ON scraper_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    estado = 'encolada'
    AND pedida_por IN (
      SELECT id FROM dim_integrantes
      WHERE auth_user_id = auth.uid() AND activo = TRUE
    )
  );

-- Frenar: lo unico que el navegador puede cambiar. La condicion de USING deja
-- claro que solo se toca una corrida viva; el WITH CHECK impide que "frenar" se
-- use de caballo de Troya para escribir cualquier otra columna.
DROP POLICY IF EXISTS scraper_runs_frenar ON scraper_runs;
CREATE POLICY scraper_runs_frenar ON scraper_runs
  FOR UPDATE TO authenticated
  USING (estado IN ('encolada', 'corriendo'))
  WITH CHECK (estado IN ('encolada', 'corriendo') AND freno_pedido = TRUE);

GRANT SELECT, INSERT ON scraper_runs TO authenticated;
GRANT UPDATE (freno_pedido) ON scraper_runs TO authenticated;
GRANT ALL ON scraper_runs TO service_role;
