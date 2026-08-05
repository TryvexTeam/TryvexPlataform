-- Cerrar dos agujeros de permisos encontrados en la auditoria de seguridad.
--
-- Los dos comparten la misma raiz: el perimetro estaba puesto en "tener una
-- cuenta" (el rol `authenticated`) en vez de en "ser del equipo"
-- (`is_integrante()`, que ademas exige `activo = true`). Cualquiera que se
-- registre en Supabase es `authenticated`; solo el equipo es integrante.

-- == 1 - El historial de WhatsApp con los clientes era publico ================
-- Las policies de estas tres tablas decian `USING (true)`, no `is_integrante()`.
-- `mensajes_wa` guarda el texto completo de cada conversacion con leads y
-- clientes reales. Con una cuenta cualquiera y la anon key (que es publica por
-- diseno, viaja en el bundle) se leia entera desde fuera de la app, sin pasar
-- nunca por el CRM:
--   GET /rest/v1/mensajes_wa?select=*
-- `knowledge_chunks` es la base de conocimiento comercial y `outreach_messages`
-- los borradores de contacto. Mismo problema.
DROP POLICY IF EXISTS mensajes_wa_select ON mensajes_wa;
CREATE POLICY mensajes_wa_select ON mensajes_wa
  FOR SELECT TO authenticated USING (is_integrante());

DROP POLICY IF EXISTS knowledge_select ON knowledge_chunks;
CREATE POLICY knowledge_select ON knowledge_chunks
  FOR SELECT TO authenticated USING (is_integrante());

DROP POLICY IF EXISTS outreach_select ON outreach_messages;
CREATE POLICY outreach_select ON outreach_messages
  FOR SELECT TO authenticated USING (is_integrante());

-- == 2 - La invitacion se podia reescribir entera ============================
-- La policy anterior era:
--   FOR UPDATE USING (used_at IS NULL AND expires_at > NOW()) WITH CHECK (true)
--
-- Tres problemas en una sola sentencia:
--   a) sin clausula TO, aplicaba tambien al rol `anon`;
--   b) el USING no pedia conocer el token: valia cualquier fila pendiente;
--   c) RLS no distingue columnas, y `WITH CHECK (true)` dejaba cambiar
--      CUALQUIERA -- incluido `email`.
--
-- Encadenado con el trigger de la 007, que da de alta como integrante ACTIVO a
-- quien se registre con un correo que tenga invitacion pendiente, la secuencia
-- completa era: reescribir el email de una invitacion ajena -> registrarse con
-- ese correo -> entrar al CRM con acceso a leads, clientes, finanzas y chat.
--
-- El endpoint que marca la invitacion usada ya trabaja con la clave de servicio
-- (`app/api/invitaciones/[token]/route.ts`), que ignora la RLS. Asi que la
-- policy no hace falta para nada: se elimina en vez de remendarla. La forma mas
-- segura de una regla es no tenerla.
DROP POLICY IF EXISTS "marcar invitacion usada" ON invitaciones;

-- Las otras dos de la 001 tampoco declaraban a quien aplican, asi que alcanzaban
-- a `anon`. Se rehacen acotadas al equipo.
DROP POLICY IF EXISTS "ver invitaciones" ON invitaciones;
CREATE POLICY "ver invitaciones" ON invitaciones
  FOR SELECT TO authenticated USING (is_integrante());

DROP POLICY IF EXISTS "crear invitaciones" ON invitaciones;
CREATE POLICY "crear invitaciones" ON invitaciones
  FOR INSERT TO authenticated WITH CHECK (is_integrante());

-- == 3 - Los hashes de los tokens de agentes ==================================
-- `GRANT SELECT ON agentes` deja leer `token_hash` a todo el equipo por REST,
-- aunque la API filtre las columnas. Son SHA-256 de 32 bytes aleatorios, o sea
-- que no se rompen -- pero no hay razon para exponer material de credenciales.
-- La vista da lo que la interfaz necesita y nada mas.
CREATE OR REPLACE VIEW agentes_publicos WITH (security_invoker = true) AS
  SELECT id, nombre, descripcion, color, avatar_url, activo, ultimo_uso_at, created_at
    FROM agentes;

GRANT SELECT ON agentes_publicos TO authenticated;

COMMENT ON VIEW agentes_publicos IS
  'Agentes sin token_hash. La interfaz lee de aca; la tabla queda para el servidor.';
