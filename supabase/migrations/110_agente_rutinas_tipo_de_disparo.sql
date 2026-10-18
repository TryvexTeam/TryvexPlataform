-- Reloj o evento: se declara, no se adivina leyendo el texto del disparador.
alter table agente_rutinas
  add column if not exists tipo text not null default 'reloj' check (tipo in ('reloj', 'evento'));
