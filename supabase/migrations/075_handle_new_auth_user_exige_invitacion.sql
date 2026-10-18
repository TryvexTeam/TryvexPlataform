-- Hallazgo de auditoría (especialista-db, 21/08): handle_new_auth_user()
-- vinculaba un dim_integrantes existente (auth_user_id IS NULL) con solo
-- que el email coincidiera, SIN exigir invitación válida — a diferencia de
-- la rama que crea un integrante nuevo, que sí la exige. Confirmado con
-- Vicho: TODO alta de integrante pasa siempre por invitación formal, así
-- que exigirla también acá no rompe ningún flujo real; solo cierra el hueco
-- de que alguien registre el email de una fila pre-cargada sin haber sido
-- invitado. "Confirm email" está activo en el proyecto, así que el ataque ya
-- requería controlar la casilla real — esto cierra el caso más acotado de
-- una fila cargada de antemano cuyo dueño real nunca llegó a registrarse.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE dim_integrantes
  SET auth_user_id = NEW.id
  WHERE lower(email) = lower(NEW.email)
    AND auth_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM invitaciones
      WHERE lower(email) = lower(NEW.email)
        AND used_at IS NULL
        AND expires_at > NOW()
    );

  IF NOT FOUND AND EXISTS (
    SELECT 1 FROM invitaciones
    WHERE lower(email) = lower(NEW.email)
      AND used_at IS NULL
      AND expires_at > NOW()
  ) THEN
    INSERT INTO dim_integrantes (auth_user_id, nombre, email, activo)
    VALUES (NEW.id, initcap(split_part(NEW.email, '@', 1)), lower(NEW.email), true)
    ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;
  END IF;

  RETURN NEW;
END;
$$;
