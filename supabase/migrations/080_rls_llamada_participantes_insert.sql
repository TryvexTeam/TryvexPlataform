-- La policy de INSERT en llamada_participantes solo verificaba que quien
-- inserta sea miembro de la conversacion de la llamada, sin exigir que
-- integrante_id sea el propio (a diferencia de UPDATE, que si lo exige).
-- Cualquier miembro podia insertar una fila a nombre de OTRO participante
-- (ej. estado: 'rechazo') y colgarle la llamada sin que esa persona hiciera
-- nada, pegandole directo a la REST de Supabase.

DROP POLICY IF EXISTS "sumarme a una llamada" ON llamada_participantes;

CREATE POLICY "sumarme a una llamada"
  ON llamada_participantes FOR INSERT TO authenticated
  WITH CHECK (
    integrante_id = mi_integrante_id()
    AND EXISTS (
      SELECT 1 FROM llamadas l
      WHERE l.id = llamada_id AND es_miembro_conversacion(l.conversacion_id)
    )
  );
