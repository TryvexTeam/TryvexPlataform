# Progreso — feat/bienvenida-ban-oauth-chat-ios

## 2026-10-13
- Migraciones 038+119 aplicadas en producción (probadas antes en transacción revertida).
- Google ya estaba activo en GoTrue; Google acepta la URI de retorno (sin redirect_uri_mismatch).
- Despachados en Orca: T-101 (Codex, worktree t101) y T-102 (Codex, worktree t102), partición de archivos disjunta.
- Sigue: veredicto por funcionalidad al recibir entregas.

## 2026-10-13 (tarde)
- T-101 integrado (merge 9f173f6) tras revisión de seguridad + fallos silenciosos (15 hallazgos corregidos) y migración 121 (IP solo desde el servidor) aplicada.
- E2E real 22/22 por túnel SSH (la red intercepta TLS de Supabase con Fortinet). Bug encontrado y corregido: doble llegada en la misma semana ocultaba el botón de saludar.
- Codex sin cuota hasta 18:37; Kimi K3/Gemini por claude-multi no sirvieron (timeouts NIM, 429). El chat lo termina un subagente Sonnet.
- Falta verificar con persona: login real con Google (necesita cuenta Google humana) y anuncio a todo el equipo (no se probó para no molestar al equipo).
