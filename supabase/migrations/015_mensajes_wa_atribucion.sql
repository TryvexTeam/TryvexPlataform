-- ============================================================================
-- 015_mensajes_wa_atribucion.sql
-- Agrega atribución de envío (Ignacio: "qué integrante mandó cada mensaje") y
-- el estado de entrega del mensaje saliente. No destructivo: ambas columnas
-- son NULLABLE y no tocan filas ni constraints existentes.
--
-- Acordado en #chatia entre Jarvis, Ariel y Spike (2026-07-17). Ver
-- cerebro/ para el contexto completo de la decisión.
--
-- NO EJECUTAR sin OK explícito de Ignacio/Adley — cambia el esquema de la
-- base de datos de producción de Tryvex.
-- ============================================================================

ALTER TABLE mensajes_wa ADD COLUMN IF NOT EXISTS enviado_por TEXT;
-- Valores esperados: 'JARVIS' | 'ARIEL' | 'SPIKE' | nombre del humano.
-- NULL para mensajes entrantes (direccion='in') — no aplica atribución de equipo.

ALTER TABLE mensajes_wa ADD COLUMN IF NOT EXISTS estado_envio TEXT
  CHECK (estado_envio IS NULL OR estado_envio IN ('enviado', 'entregado', 'leido', 'fallido'));
-- Solo aplica a salientes (direccion='out'). NULL para entrantes.
