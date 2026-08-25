-- Datos de contacto que faltaban en los leads.
--
-- Al llamar/escribir a un lead hace falta confirmar y corregir su contacto:
-- el telefono ya estaba, pero el correo y el nombre de la persona no existian
-- como columna. Ademas el repo (convertirEnCliente) ya intentaba leer `email` y
-- `nombre_contacto` de fact_leads, asi que sin estas columnas esa conversion
-- fallaba en silencio. Aditivo y nullable: no toca ningun dato existente.
ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS email           TEXT,
  ADD COLUMN IF NOT EXISTS nombre_contacto TEXT;
