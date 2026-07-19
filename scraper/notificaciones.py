"""
Módulo de notificaciones para el scraper de leads.
Soporta Discord, Telegram, Slack y Notion simultáneamente.
Se activa cualquier canal configurando su variable de entorno correspondiente.
"""

import logging
import os
from datetime import datetime
from typing import Optional

import httpx

log = logging.getLogger(__name__)


# ── Construcción del mensaje ──────────────────────────────────────────────────
def _texto_resumen(resumen: dict) -> str:
    fecha = resumen.get("fecha", datetime.now().strftime("%Y-%m-%d %H:%M"))
    duracion = resumen.get("duracion_min", "?")
    nuevos = resumen.get("nuevos_leads", 0)
    actualizados = resumen.get("actualizados", 0)
    descartados = resumen.get("descartados", 0)
    total = resumen.get("total_procesados", 0)

    top = resumen.get("top_leads", [])[:5]
    if top:
        top_texto = "\n".join(
            f"  • {l['nombre']} ({l['nicho']}) — score {l['score']}"
            for l in top
        )
    else:
        top_texto = "  Sin leads destacados"

    categorias = resumen.get("por_categoria", {})
    cat_texto = ""
    if categorias:
        cat_texto = "\n\nDesglose por categoria:\n" + "\n".join(
            f"  {cat}: {v['nuevos']} nuevos, {v['actualizados']} actualizados"
            for cat, v in list(categorias.items())[:8]
            if v["nuevos"] + v["actualizados"] > 0
        )

    return (
        f"Scraper Google Maps — Santiago de Chile\n"
        f"Fecha: {fecha} | Duracion: {duracion} min\n\n"
        f"Resultados:\n"
        f"  Nuevos leads:    {nuevos}\n"
        f"  Actualizados:    {actualizados}\n"
        f"  Descartados:     {descartados}\n"
        f"  Total procesados:{total}\n\n"
        f"Top leads por score:\n{top_texto}"
        f"{cat_texto}"
    )


# ── Discord ───────────────────────────────────────────────────────────────────
async def enviar_discord(resumen: dict) -> None:
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "")
    if not webhook_url:
        return

    mensaje = _texto_resumen(resumen)
    payload = {
        "embeds": [
            {
                "title": "Scraper Google Maps completado",
                "description": f"```\n{mensaje}\n```",
                "color": 5814783,
                "footer": {"text": "scrapper-tryvex"},
                "timestamp": datetime.utcnow().isoformat(),
            }
        ]
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(webhook_url, json=payload, timeout=10)
        if r.status_code in (200, 204):
            log.info("[Discord] Notificacion enviada OK")
        else:
            log.error(f"[Discord] Error {r.status_code}: {r.text}")


# ── Telegram ──────────────────────────────────────────────────────────────────
async def enviar_telegram(resumen: dict) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return

    mensaje = _texto_resumen(resumen)
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": f"```\n{mensaje}\n```",
        "parse_mode": "Markdown",
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(url, json=payload, timeout=10)
        if r.status_code == 200:
            log.info("[Telegram] Notificacion enviada OK")
        else:
            log.error(f"[Telegram] Error {r.status_code}: {r.text}")


# ── Slack ─────────────────────────────────────────────────────────────────────
async def enviar_slack(resumen: dict) -> None:
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "")
    if not webhook_url:
        return

    nuevos = resumen.get("nuevos_leads", 0)
    actualizados = resumen.get("actualizados", 0)
    total = resumen.get("total_procesados", 0)
    fecha = resumen.get("fecha", "")
    duracion = resumen.get("duracion_min", "?")

    top = resumen.get("top_leads", [])[:3]
    top_texto = "\n".join(
        f"• {l['nombre']} ({l['nicho']}) — score {l['score']}" for l in top
    ) or "Sin leads destacados"

    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "Scraper Google Maps — Santiago completado",
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Fecha:*\n{fecha}"},
                    {"type": "mrkdwn", "text": f"*Duracion:*\n{duracion} min"},
                    {"type": "mrkdwn", "text": f"*Nuevos leads:*\n{nuevos}"},
                    {"type": "mrkdwn", "text": f"*Actualizados:*\n{actualizados}"},
                    {"type": "mrkdwn", "text": f"*Total procesados:*\n{total}"},
                ],
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Top leads:*\n{top_texto}",
                },
            },
        ]
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(webhook_url, json=payload, timeout=10)
        if r.status_code == 200:
            log.info("[Slack] Notificacion enviada OK")
        else:
            log.error(f"[Slack] Error {r.status_code}: {r.text}")


# ── Notion ────────────────────────────────────────────────────────────────────
async def enviar_notion(resumen: dict) -> None:
    token = os.getenv("NOTION_TOKEN", "")
    database_id = os.getenv("NOTION_DATABASE_ID", "")
    if not token or not database_id:
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }

    fecha_hoy = datetime.now().strftime("%Y-%m-%d")
    titulo = f"Scraper {resumen.get('fecha', fecha_hoy)}"

    payload = {
        "parent": {"database_id": database_id},
        "properties": {
            "Nombre": {
                "title": [{"text": {"content": titulo}}]
            },
            "Nuevos Leads": {"number": resumen.get("nuevos_leads", 0)},
            "Actualizados": {"number": resumen.get("actualizados", 0)},
            "Total Procesados": {"number": resumen.get("total_procesados", 0)},
            "Duracion (min)": {"number": resumen.get("duracion_min", 0)},
            "Fecha": {"date": {"start": fecha_hoy}},
        },
    }

    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.notion.com/v1/pages",
            headers=headers,
            json=payload,
            timeout=10,
        )
        if r.status_code == 200:
            log.info("[Notion] Entrada creada OK")
        else:
            log.error(f"[Notion] Error {r.status_code}: {r.text}")


# ── Dispatcher ────────────────────────────────────────────────────────────────
async def notificar(resumen: dict) -> None:
    """
    Envía el resumen a todos los canales que tengan credenciales configuradas.
    Pueden estar activos varios canales al mismo tiempo.
    """
    canales = [
        ("Discord",  enviar_discord,  "DISCORD_WEBHOOK_URL"),
        ("Telegram", enviar_telegram, "TELEGRAM_BOT_TOKEN"),
        ("Slack",    enviar_slack,    "SLACK_WEBHOOK_URL"),
        ("Notion",   enviar_notion,   "NOTION_TOKEN"),
    ]

    alguno_activo = False
    for nombre, fn, env_key in canales:
        if os.getenv(env_key):
            alguno_activo = True
            try:
                await fn(resumen)
            except Exception as e:
                log.error(f"[{nombre}] Fallo al notificar: {e}")

    if not alguno_activo:
        log.warning(
            "Ningun canal de notificacion configurado. "
            "Agrega DISCORD_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, "
            "SLACK_WEBHOOK_URL o NOTION_TOKEN al .env"
        )
