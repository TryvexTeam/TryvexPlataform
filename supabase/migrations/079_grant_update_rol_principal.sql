-- PR #144 cambio perfil-form.tsx para escribir rol_principal en vez de
-- especialidad, pero rol_principal nunca tuvo el GRANT UPDATE columnar para
-- `authenticated` (solo especialidad lo tenia) -- "permission denied for
-- table dim_integrantes" confirmado en logs de prod al guardar el perfil.
GRANT UPDATE (rol_principal) ON dim_integrantes TO authenticated;
