-- Foto propia para los hilos con nombre (grupos y el canal de agentes).
--
-- Hasta ahora la bandeja resolvía el avatar mirando al "otro" miembro, que en un
-- DM es correcto pero en un grupo es arbitrario: mostraba la cara de cualquiera.
-- Un hilo con nombre propio merece imagen propia.
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- El grupo del equipo estrena el logo de Tryvex.
UPDATE conversaciones
   SET avatar_url = 'https://wfsjzhshkaokjoansbhc.supabase.co/storage/v1/object/public/avatares/conversaciones/equipo-tryvex.png'
 WHERE tipo = 'grupo' AND nombre = 'Equipo Tryvex';
