-- Vincula auth_user_id al integrante con el mismo email al registrarse
-- (los integrantes se pre-crean vía invitación; el signup solo crea el auth user)
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE dim_integrantes
  SET auth_user_id = NEW.id
  WHERE email = NEW.email AND auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
