-- Bug reportado por Vicho: "mi rol no se actualiza en tryvex.tech/team".
--
-- Causa: el campo "Especialidad / rol" de /settings escribía en la columna
-- `especialidad` (que ningun otro codigo lee ni muestra en ningun lado),
-- no en `rol_principal` (la que de verdad lee v_equipo_publico). El fix de
-- codigo (PerfilUpdateSchema + perfil-form.tsx) ya corrige el campo hacia
-- adelante; esta migracion recupera lo que 3 personas ya habian escrito ahi
-- pensando que se iba a publicar, incluido Ignacio (su rol_principal
-- quedaba en "admin", un valor de seed/interno, no lo que puso en el form).
--
-- Solo pisa rol_principal donde especialidad tiene contenido real -- no
-- toca a nadie que nunca uso ese campo.
UPDATE dim_integrantes
SET rol_principal = especialidad
WHERE especialidad IS NOT NULL;
