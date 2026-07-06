# /bucle-agentico — Ejecutar PRP Fase por Fase

> Implementa un PRP aprobado usando mapeo de contexto just-in-time.
> Uso: `/bucle-agentico [PRP-XXX]` o sin argumento para usar el PRP más reciente en estado APROBADO.

---

## Cuándo Usar

- Un PRP fue aprobado y hay que implementarlo
- Feature que toca múltiples archivos coordinados
- Cambios en DB + código + UI
- Fases que dependen una de otra

---

## Flujo de Ejecución

```
Leer PRP aprobado
    ↓
FASE 1: Mapear contexto real → Generar subtareas → Ejecutar
    ↓
FASE 2: Mapear contexto actualizado → Generar subtareas → Ejecutar
    ↓
...
FASE N: Validación final (build + browser check)
```

**CLAVE**: No generar subtareas de fases futuras hasta entrar a esa fase.

---

## Por Fase

1. **Mapear contexto** — Leer archivos relevantes, entender estado actual
2. **Generar subtareas** — Basadas en realidad (no suposiciones)
3. **Ejecutar** — Una subtarea a la vez
4. **Auto-blindaje** — Documentar errores en el PRP (sección Aprendizajes)
5. **Validar** — Confirmar que la fase está completa antes de avanzar

---

## Auto-Blindaje

Cuando algo falla durante la ejecución, documentarlo en el PRP:

```markdown
### [FECHA]: [Título del error]
- **Error**: [Qué falló exactamente]
- **Fix**: [Cómo se arregló]
- **Aplicar en**: [Dónde más aplica]
```

El mismo error **nunca ocurre dos veces** en este proyecto.

---

## Validación Final

Al completar todas las fases:
- `npm run build` — debe pasar sin errores
- Verificar flujo en browser (localhost:3000)
- Confirmar criterios de éxito del PRP cumplidos
