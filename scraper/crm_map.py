# -*- coding: utf-8 -*-
"""Mapea un lead del scraper (esquema viejo del leads-dashboard) al esquema del
CRM de Tryvex (tabla fact_leads).

Por qué existe: el scraper.py se escribió para el leads-dashboard (que se jubila).
Su tabla fact_leads tenía otro esquema. El CRM usa columnas y reglas distintas:
  - `nombre`        -> `nombre_negocio`
  - `redes` (text)  -> `redes_sociales` (jsonb)
  - `score` 0-100   -> 1-10   (la migración 003 del CRM puso CHECK 1..10)
  - `estado='nuevo'`-> `'sin_contactar'`
  - + `origen='scraper'`, y rating/reseñas/horario/dirección -> `notas`/`localidad`
Es la MISMA lógica que ya validé migrando los 290 leads (scripts/migrar_leads_308.py);
acá se reusa para que el scraper escriba directo bien en el CRM.
"""
import re

# estado viejo -> estado del CRM (enum fact_leads)
_MAP_ESTADO = {
    "nuevo": "sin_contactar",
    "sin_contactar": "sin_contactar",
    "contactado": "contactado",
    "interesado": "interesado",
    "reunion_agendada": "reunion_agendada",
    "cerrado": "cerrado",
    "descartado": "descartado",
}


def score_1_10(score_0_100) -> int:
    """0-100 -> 1-10, clamp. El CRM tiene CHECK (score BETWEEN 1 AND 10)."""
    try:
        return max(1, min(10, round(int(score_0_100) / 10)))
    except (TypeError, ValueError):
        return 5


def a_crm(lead: dict) -> dict:
    """Traduce el dict `lead` del scraper al payload de fact_leads del CRM."""
    nombre = (lead.get("nombre") or "").strip()

    redes = (lead.get("redes") or "").strip()
    redes_json = {"origen_texto": redes} if redes else None

    # datos de contexto que el CRM no tiene como columna -> a notas
    ctx = []
    if lead.get("rating") is not None:
        ctx.append(f"Rating Google: {lead['rating']}")
    if lead.get("num_resenas") is not None:
        ctx.append(f"Reseñas: {lead['num_resenas']}")
    if lead.get("horario"):
        ctx.append(f"Horario: {lead['horario']}")
    if lead.get("direccion"):
        ctx.append(f"Dirección: {lead['direccion']}")

    # localidad: la mejor señal disponible (comuna > dirección)
    localidad = lead.get("comuna") or lead.get("direccion") or None

    return {
        "nombre_negocio": nombre,
        "telefono": (lead.get("telefono") or None),
        "info_texto": (lead.get("info_texto") or None),
        "redes_sociales": redes_json,
        "tiene_web": bool(lead.get("tiene_web")),
        "nicho": lead.get("nicho") or None,
        "localidad": localidad,
        "score": score_1_10(lead.get("score")),
        "estado": _MAP_ESTADO.get((lead.get("estado") or "nuevo").strip().lower(), "sin_contactar"),
        "origen": "scraper",
        "notas": " · ".join(ctx) or None,
    }


def campos_update(lead: dict) -> dict:
    """Solo los campos de contacto/score a refrescar en un lead que YA existe
    (preserva estado/origen/notas que el equipo pudo haber tocado a mano)."""
    m = a_crm(lead)
    return {
        "telefono": m["telefono"],
        "redes_sociales": m["redes_sociales"],
        "info_texto": m["info_texto"],
        "score": m["score"],
        "localidad": m["localidad"],
    }
