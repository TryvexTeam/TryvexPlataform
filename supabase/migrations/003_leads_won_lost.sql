-- Won/Lost en pipeline de leads: 'cerrado' se divide en 'ganado' | 'perdido'
-- + razon_perdida para aprendizaje de negocio
-- + score alineado a escala 1-10 (la que usa la app)

ALTER TABLE fact_leads DROP CONSTRAINT IF EXISTS fact_leads_estado_check;
ALTER TABLE fact_leads ADD CONSTRAINT fact_leads_estado_check
  CHECK (estado IN ('sin_contactar','contactado','interesado','reunion_agendada','ganado','perdido','descartado'));

ALTER TABLE fact_leads ADD COLUMN IF NOT EXISTS razon_perdida TEXT
  CHECK (razon_perdida IN ('precio','sin_respuesta','competencia','sin_interes','otro'));

ALTER TABLE fact_leads DROP CONSTRAINT IF EXISTS fact_leads_score_check;
ALTER TABLE fact_leads ADD CONSTRAINT fact_leads_score_check
  CHECK (score BETWEEN 1 AND 10);
