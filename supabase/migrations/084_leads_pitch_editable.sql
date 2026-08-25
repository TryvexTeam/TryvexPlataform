-- El pitch editado a mano de un lead.
--
-- El guion de la llamada se genera solo (lib/leads/pitch.ts) desde los datos del
-- negocio, pero el equipo quiere poder ajustarlo antes de llamar —cambiar una
-- frase, el gancho, el cierre— y que ese ajuste quede guardado para ese lead.
-- Se guarda el arreglo de turnos {rol, texto, guia} como jsonb. NULL = usar el
-- generado. Aditivo y nullable: no toca ningún dato.
ALTER TABLE fact_leads
  ADD COLUMN IF NOT EXISTS pitch JSONB;
