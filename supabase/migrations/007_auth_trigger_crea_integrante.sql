-- Fix "No eres integrante activo": el trigger anterior solo vinculaba
-- auth_user_id a un integrante pre-existente por email. Los invitados nunca
-- se pre-creaban en dim_integrantes, así que quedaban huérfanos.
-- Ahora: vincula (case-insensitive) o crea el integrante si el email tiene
-- una invitación válida pendiente al momento del signup.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE dim_integrantes
  SET auth_user_id = NEW.id
  WHERE lower(email) = lower(NEW.email) AND auth_user_id IS NULL;

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

-- Reparar usuarios ya registrados que quedaron sin integrante
INSERT INTO dim_integrantes (auth_user_id, nombre, email, activo)
SELECT u.id, initcap(split_part(u.email, '@', 1)), lower(u.email), true
FROM auth.users u
LEFT JOIN dim_integrantes di ON di.auth_user_id = u.id
WHERE di.id IS NULL
ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;
