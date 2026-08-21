-- Hallazgo pendiente de la auditoría de agosto: cualquier integrante activo
-- podía invitar a quien fuera sin aprobación de nadie (solo rate limit de
-- 10/hora). Ahora una invitación creada por alguien que no es superadmin
-- queda pendiente hasta que un superadmin la apruebe; recién ahí se manda
-- el mail y el token empieza a aceptarse.
--
-- Las invitaciones existentes se dan por aprobadas (aprobado_at=created_at):
-- ya se mandaron por fuera de este flujo nuevo, bloquearlas de golpe
-- dejaría a alguien con un link válido en la mano que de repente deja de
-- funcionar sin aviso.
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS aprobado_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS aprobado_por UUID REFERENCES dim_integrantes(id) ON DELETE SET NULL;

UPDATE invitaciones SET aprobado_at = created_at WHERE aprobado_at IS NULL;

-- El panel de aprobación de un superadmin necesita ver TODAS las
-- invitaciones pendientes, no solo las que él mismo generó.
CREATE POLICY "superadmin ve todas las invitaciones"
  ON invitaciones FOR SELECT TO authenticated
  USING (soy_superadmin());

-- Solo un superadmin aprueba (aprobado_at/aprobado_por). El resto de la fila
-- ya es inmutable una vez creada, así que no hace falta acotar columnas acá:
-- el endpoint que llama a esto solo toca aprobado_at/aprobado_por.
CREATE POLICY "superadmin aprueba invitaciones"
  ON invitaciones FOR UPDATE TO authenticated
  USING (soy_superadmin())
  WITH CHECK (soy_superadmin());

-- El chequeo de validez del token ahora exige también estar aprobada — se
-- redefine handle_new_auth_user (mismas propiedades que la 075: plpgsql,
-- SECURITY DEFINER, search_path=public) agregando `AND aprobado_at IS NOT NULL`
-- a las dos condiciones que ya miraban `invitaciones`.
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
        AND aprobado_at IS NOT NULL
    );

  IF NOT FOUND AND EXISTS (
    SELECT 1 FROM invitaciones
    WHERE lower(email) = lower(NEW.email)
      AND used_at IS NULL
      AND expires_at > NOW()
      AND aprobado_at IS NOT NULL
  ) THEN
    INSERT INTO dim_integrantes (auth_user_id, nombre, email, activo)
    VALUES (NEW.id, initcap(split_part(NEW.email, '@', 1)), lower(NEW.email), true)
    ON CONFLICT (email) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id;
  END IF;

  RETURN NEW;
END;
$$;
