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
from typing import Optional

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


# El Area de Uso Privado de Unicode (U+E000 a U+F8FF): ahi viven los iconos
# de las fuentes propias, como el simbolo del telefono que Maps pega al texto.
# Se arma con chr() a proposito: escrito con el caracter literal, el patron
# queda invisible en el editor y nadie entiende que dice.
_ICONOS_DE_FUENTE = re.compile("[%s-%s]" % (chr(0xE000), chr(0xF8FF)))


def limpiar(texto) -> Optional[str]:
    """Deja el texto en una sola linea, sin basura invisible, o None.

    Dos suciedades distintas venian de Maps y se guardaban tal cual:

    1. **Un glifo de icono.** Maps dibuja el simbolo del telefono con una fuente
       propia, y ese caracter viaja pegado al texto: los telefonos empiezan con
       U+E0B0, del Area de Uso Privado de Unicode. No es un espacio, asi que
       ningun `strip` lo saca, y segun donde se muestre se ve como un cuadrito
       o como nada.
    2. **Saltos de linea** adelante y atras.

    Entre las dos, 463 de los 538 telefonos de la cartera quedaron con basura
    adentro. El envio por WhatsApp funcionaba igual solo porque el puente
    descarta todo lo que no sea digito antes de usarlos: eso es una red debajo
    del error, no un arreglo. Cualquier cosa que muestre o compare el texto
    —una busqueda, un `=`, la ficha en pantalla— se rompe.
    """
    if texto is None:
        return None
    limpio = _ICONOS_DE_FUENTE.sub("", str(texto))
    limpio = re.sub(r"\s+", " ", limpio).strip()
    return limpio or None


def instagram_de(redes: str) -> Optional[str]:
    """La URL del perfil de Instagram, limpia, o None.

    `redes` es texto suelto con una o varias URLs, muchas veces la misma
    repetida y con parametros de seguimiento pegados (`?igshid=...`). Se toma la
    primera de Instagram y se corta en el `?`: lo que sigue no es del perfil.
    """
    if not redes:
        return None
    m = re.search(r"https?://(?:www\.)?instagram\.com/[A-Za-z0-9_.]+", redes)
    return m.group(0).split("?")[0] if m else None


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
        # El identificador del local en Maps (migracion 049). Es lo que permite
        # reconocer el MISMO negocio aunque le cambien el nombre, y lo que evita
        # las fichas duplicadas que hoy tiene la cartera.
        "google_place_id": lead.get("google_place_id") or None,
        "categoria_google": limpiar(lead.get("categoria_google")),
        "telefono": limpiar(lead.get("telefono")),
        # `info_texto` conserva su salto de linea a proposito: es el crudo de la
        # ficha (la calificacion, salto, y las reseñas entre parentesis) y hay
        # codigo que lo lee con ese formato.
        "info_texto": (lead.get("info_texto") or None),
        "redes_sociales": redes_json,
        "tiene_web": bool(lead.get("tiene_web")),
        "nicho": lead.get("nicho") or None,
        "localidad": localidad,
        "score": score_1_10(lead.get("score")),
        # Columnas propias (migracion 047). Antes estos datos solo iban a
        # `notas`, aplastados en una linea de texto: nadie podia filtrarlos y
        # el redactor de mensajes no los veia. Se siguen dejando tambien en
        # `notas` porque ahi es donde el equipo los lee hoy.
        "google_rating": lead.get("rating"),
        "google_resenas": lead.get("num_resenas"),
        "horario": limpiar(lead.get("horario")),
        "instagram": instagram_de(redes),
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
        "google_rating": m["google_rating"],
        "google_resenas": m["google_resenas"],
        "horario": m["horario"],
        "instagram": m["instagram"],
        "google_place_id": m["google_place_id"],
        "categoria_google": m["categoria_google"],
        "score": m["score"],
        "localidad": m["localidad"],
    }
