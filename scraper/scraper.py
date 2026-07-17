#!/usr/bin/env python3
"""
Scraper de leads desde Google Maps — Santiago de Chile
Extrae negocios sin sitio web con datos de contacto e inserta en Supabase.
Soporta upsert (actualiza si ya existe), notificaciones y despliegue en Railway.
"""

import argparse
import asyncio
import logging
import random
import re
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from playwright.async_api import async_playwright, Page, BrowserContext
from playwright.async_api import TimeoutError as PlaywrightTimeout
from supabase import create_client, Client

from notificaciones import notificar
from crm_map import a_crm, campos_update  # mapeo esquema viejo -> CRM de Tryvex

# Alias para correr llamadas síncronas de Supabase sin bloquear el event loop
_in_thread = asyncio.to_thread

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("scraper.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

# ── Configuración ─────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
HEADLESS = os.getenv("HEADLESS", "true").lower() != "false"

LAT, LNG, ZOOM = -33.4489, -70.6693, 13
MAX_POR_CATEGORIA = 20

CATEGORIAS = [
    "restaurantes",
    "peluquerías",
    "dentistas",
    "tiendas de ropa",
    "talleres mecánicos",
    "farmacias",
    "gimnasios",
    "panaderías",
    "ferreterías",
    "veterinarias",
    "cafeterías",
    "pizzerías",
    "barberías",
    "centros de estética",
    "electricistas",
    "contadores",
    "abogados",
    "psicólogos",
    "kinesiólogos",
    "ópticas",
    "librerías",
    "florerías",
    "joyerías",
]

SOCIAL_DOMAINS = (
    "instagram.com",
    "facebook.com",
    "twitter.com",
    "tiktok.com",
    "linkedin.com",
    "youtube.com",
)


# ── Helpers ───────────────────────────────────────────────────────────────────
def es_red_social(url: str) -> bool:
    return any(d in url.lower() for d in SOCIAL_DOMAINS)


def extraer_redes_del_texto(texto: str) -> Optional[str]:
    patrones = [
        r"(?:https?://)?(?:www\.)?instagram\.com/[\w.@]+",
        r"(?:https?://)?(?:www\.)?facebook\.com/[\w.@/\-]+",
        r"(?:https?://)?(?:www\.)?tiktok\.com/@[\w.]+",
        r"(?:https?://)?(?:www\.)?twitter\.com/[\w.@]+",
        r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w.\-]+",
    ]
    encontradas: list[str] = []
    for p in patrones:
        encontradas.extend(re.findall(p, texto, re.IGNORECASE))
    unique = list(dict.fromkeys(encontradas))
    return ", ".join(unique) if unique else None


def calcular_score(
    telefono: Optional[str],
    redes: Optional[str],
    info_texto: Optional[str],
    rating: Optional[float] = None,
    num_resenas: Optional[int] = None,
) -> int:
    score = 0
    if telefono:
        score += 50
    if redes:
        score += 30
    if info_texto and len(info_texto.strip()) > 10:
        score += 20
    # Rating bajo → oportunidad de mejora de reputación
    if rating is not None and rating < 4.0:
        score += 15
    # Pocas reseñas → oportunidad de marketing
    if num_resenas is not None and num_resenas < 20:
        score += 10
    return score


async def delay() -> None:
    await asyncio.sleep(random.uniform(0.5, 1.2))


# ── Supabase: insertar o actualizar (async) — escribe en el ESQUEMA DEL CRM ────
async def insertar_o_actualizar(supabase: Client, lead: dict) -> str:
    """
    Verifica si el lead ya existe por (nombre_negocio, nicho) EN EL CRM.
    - Si existe: refresca contacto/score, preserva estado/origen/notas (que el
      equipo pudo tocar a mano).
    - Si no existe: inserta como nuevo (estado 'sin_contactar', origen 'scraper').
    Retorna 'nuevo' o 'actualizado'.

    El `lead` que llega es del esquema viejo del scraper; se traduce al del CRM
    con crm_map antes de escribir (score 0-100 -> 1-10, redes text -> jsonb, etc.).
    """
    payload = a_crm(lead)  # esquema del CRM

    existing = await _in_thread(
        lambda: supabase.table("fact_leads")
        .select("id, estado")
        .eq("nombre_negocio", payload["nombre_negocio"])
        .eq("nicho", payload["nicho"])
        .execute()
    )

    if existing.data:
        record_id = existing.data[0]["id"]
        update_data = {**campos_update(lead),
                       "updated_at": datetime.now(timezone.utc).isoformat()}
        await _in_thread(
            lambda: supabase.table("fact_leads").update(update_data).eq("id", record_id).execute()
        )
        return "actualizado"

    await _in_thread(lambda: supabase.table("fact_leads").insert(payload).execute())
    return "nuevo"


# ── Interacción con Google Maps ───────────────────────────────────────────────
async def aceptar_cookies(page: Page) -> None:
    try:
        for selector in [
            'button[aria-label*="Accept"]',
            'button[aria-label*="Aceptar"]',
            'button[jsname="b3VHJd"]',
        ]:
            btn = await page.query_selector(selector)
            if btn:
                await btn.click()
                await asyncio.sleep(1)
                return
    except Exception:
        pass


async def scroll_panel(page: Page, veces: int = 4) -> None:
    for _ in range(veces):
        try:
            await page.evaluate(
                """() => {
                    const feed = document.querySelector('[role="feed"]');
                    if (feed) feed.scrollBy(0, 600);
                }"""
            )
        except Exception:
            pass
        await asyncio.sleep(0.6)


async def obtener_hrefs_resultados(page: Page) -> list[str]:
    hrefs: list[str] = []
    try:
        elements = await page.query_selector_all("a.hfpxzc")
        for el in elements[:MAX_POR_CATEGORIA]:
            href = await el.get_attribute("href")
            if href:
                hrefs.append(href)
    except Exception as e:
        log.warning(f"Error obteniendo hrefs: {e}")
    return hrefs


# ── Extracción de datos por negocio ───────────────────────────────────────────
async def extraer_telefono(page: Page) -> Optional[str]:
    try:
        el = await page.query_selector('[data-item-id^="phone:tel:"]')
        if el:
            text = (await el.inner_text()).strip()
            if text:
                return text
    except Exception:
        pass

    try:
        link = await page.query_selector('a[href^="tel:"]')
        if link:
            href = await link.get_attribute("href") or ""
            num = href.replace("tel:", "").strip()
            if num:
                return num
    except Exception:
        pass

    try:
        buttons = await page.query_selector_all("button[aria-label]")
        for btn in buttons:
            label = await btn.get_attribute("aria-label") or ""
            match = re.search(r"(\+?56[\s\-]?\d[\d\s\-]{6,}|\d[\d\s\-]{7,})", label)
            if match:
                return match.group().strip()
    except Exception:
        pass

    return None


async def extraer_info_texto(page: Page) -> Optional[str]:
    for selector in [
        '[data-attrid="kc:/local:summary_description"] span',
        ".PYvSYb span",
        ".LBgpqf .fontBodyMedium",
    ]:
        try:
            el = await page.query_selector(selector)
            if el:
                text = (await el.inner_text()).strip()
                if text:
                    return text[:500]
        except Exception:
            pass

    for selector in [".wiI7pd", ".MyEned span", ".jJc9Ad .rsqaWe"]:
        try:
            el = await page.query_selector(selector)
            if el:
                text = (await el.inner_text()).strip()
                if text:
                    return text[:500]
        except Exception:
            pass

    return None


async def extraer_rating(page: Page) -> Optional[float]:
    try:
        el = await page.query_selector("div.F7nice span[aria-hidden='true']")
        if el:
            text = (await el.inner_text()).strip().replace(",", ".")
            return float(text)
    except Exception:
        pass
    return None


async def extraer_num_resenas(page: Page) -> Optional[int]:
    try:
        el = await page.query_selector("div.F7nice span[aria-label]")
        if el:
            label = (await el.get_attribute("aria-label") or "")
            match = re.search(r"(\d[\d.,]*)", label)
            if match:
                return int(match.group(1).replace(".", "").replace(",", ""))
    except Exception:
        pass
    return None


async def extraer_direccion(page: Page) -> Optional[str]:
    for selector in [
        'button[data-item-id="address"] .Io6YTe',
        '[data-tooltip="Copiar dirección"] .Io6YTe',
        'button[aria-label*="irección"] .Io6YTe',
    ]:
        try:
            el = await page.query_selector(selector)
            if el:
                text = (await el.inner_text()).strip()
                if text:
                    return text
        except Exception:
            pass
    return None


async def extraer_horario(page: Page) -> Optional[str]:
    try:
        el = await page.query_selector(".o0Svhf")
        if el:
            text = (await el.inner_text()).strip()
            if text:
                return text[:200]
    except Exception:
        pass
    try:
        el = await page.query_selector('[data-item-id*="oh"] .t39EBf')
        if el:
            text = (await el.inner_text()).strip()
            if text:
                return text[:200]
    except Exception:
        pass
    return None


async def extraer_negocio(page: Page) -> Optional[dict]:
    nombre: Optional[str] = None
    for selector in ["h1.DUwDvf", "h1[data-attrid]", "h1"]:
        try:
            el = await page.wait_for_selector(selector, timeout=7000)
            text = (await el.inner_text()).strip()
            if text:
                nombre = text
                break
        except (PlaywrightTimeout, Exception):
            continue

    if not nombre:
        return None

    tiene_web = False
    redes_desde_web: Optional[str] = None
    try:
        web_el = await page.query_selector('a[data-item-id="authority"]')
        if web_el:
            href = (await web_el.get_attribute("href") or "").strip()
            if href:
                if es_red_social(href):
                    redes_desde_web = href
                else:
                    tiene_web = True
    except Exception:
        pass

    if tiene_web:
        return None

    telefono = await extraer_telefono(page)
    info_texto = await extraer_info_texto(page)
    rating = await extraer_rating(page)
    num_resenas = await extraer_num_resenas(page)
    direccion = await extraer_direccion(page)
    horario = await extraer_horario(page)

    redes: Optional[str] = None
    try:
        content = await page.content()
        redes_html = extraer_redes_del_texto(content)
        candidatas = [r for r in [redes_desde_web, redes_html] if r]
        redes = ", ".join(candidatas) if candidatas else None
    except Exception:
        redes = redes_desde_web

    return {
        "nombre": nombre,
        "telefono": telefono,
        "info_texto": info_texto,
        "redes": redes,
        "tiene_web": False,
        "rating": rating,
        "num_resenas": num_resenas,
        "direccion": direccion,
        "horario": horario,
    }


# ── Scraping por categoría ────────────────────────────────────────────────────
async def scrape_categoria(
    page: Page,
    categoria: str,
    supabase: Client,
    stats_global: dict,
    ciudad: str = "Santiago de Chile",
    comuna: str = "",
    region: str = "",
    pais: str = "Chile",
    zoom: int = 13,
    stop_file: str = "",
) -> dict:
    log.info(f"[{categoria}] Iniciando busqueda...")
    stats_cat = {"nuevos": 0, "actualizados": 0, "descartados": 0, "top": []}

    partes = [categoria]
    if comuna:
        partes.append(comuna)
    if region:
        partes.append(region)
    if ciudad:
        partes.append(ciudad)
    if pais:
        partes.append(pais)

    query = "+".join(p.replace(" ", "+") for p in partes if p)

    if ciudad.lower() in ["santiago", "santiago de chile", "santiago, chile"]:
        url = f"https://www.google.com/maps/search/{query}/@-33.4489,-70.6693,{zoom}z?hl=es"
    else:
        url = f"https://www.google.com/maps/search/{query}/?hl=es"

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
    except PlaywrightTimeout:
        log.error(f"[{categoria}] Timeout al cargar pagina, saltando.")
        return stats_cat

    await aceptar_cookies(page)
    await delay()
    await scroll_panel(page, veces=8)

    hrefs = await obtener_hrefs_resultados(page)
    log.info(f"[{categoria}] {len(hrefs)} resultados encontrados")

    if not hrefs:
        return stats_cat

    for i, href in enumerate(hrefs):
        if stop_file and os.path.exists(stop_file):
            log.info(f"[{categoria}] Stop flag detectado, deteniendo.")
            break
        try:
            await page.goto(href, wait_until="domcontentloaded", timeout=20000)
            await delay()

            datos = await extraer_negocio(page)

            if datos is None:
                stats_cat["descartados"] += 1
                stats_global["descartados"] += 1
                log.debug(f"[{categoria}] #{i + 1} descartado (tiene web o sin nombre)")
                continue

            if not datos.get("telefono") and not datos.get("redes"):
                stats_cat["descartados"] += 1
                stats_global["descartados"] += 1
                log.debug(f"[{categoria}] #{i + 1} '{datos['nombre']}' sin contacto, descartado")
                continue

            score = calcular_score(
                datos["telefono"],
                datos["redes"],
                datos["info_texto"],
                datos.get("rating"),
                datos.get("num_resenas"),
            )

            lead = {
                "nombre": datos["nombre"],
                "telefono": datos["telefono"],
                "info_texto": datos["info_texto"],
                "redes": datos["redes"],
                "tiene_web": False,
                "nicho": categoria,
                "score": score,
                "estado": "nuevo",
                "rating": datos.get("rating"),
                "num_resenas": datos.get("num_resenas"),
                "direccion": datos.get("direccion"),
                "horario": datos.get("horario"),
                "comuna": comuna,
                "region": region,
                "pais": pais,
            }

            try:
                resultado = await insertar_o_actualizar(supabase, lead)
                stats_cat[resultado + "s"] += 1
                stats_global[resultado + "s"] += 1
                stats_global["top_leads"].append(
                    {"nombre": datos["nombre"], "nicho": categoria, "score": score}
                )
                log.info(
                    f"[{categoria}] {resultado.upper()}: '{datos['nombre']}' | "
                    f"tel={datos['telefono']} | score={score} | "
                    f"rating={datos.get('rating')} | reseñas={datos.get('num_resenas')}"
                )
            except Exception as db_err:
                log.error(f"[{categoria}] Error Supabase '{datos['nombre']}': {db_err}")

        except PlaywrightTimeout:
            log.warning(f"[{categoria}] #{i + 1} Timeout, continuando")
            stats_cat["descartados"] += 1
            stats_global["descartados"] += 1
        except Exception as e:
            log.error(f"[{categoria}] #{i + 1} Error: {e}")
            stats_cat["descartados"] += 1
            stats_global["descartados"] += 1

        await delay()

    log.info(
        f"[{categoria}] Completado — "
        f"{stats_cat['nuevos']} nuevos, "
        f"{stats_cat['actualizados']} actualizados, "
        f"{stats_cat['descartados']} descartados"
    )
    return stats_cat


# ── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    global MAX_POR_CATEGORIA

    parser = argparse.ArgumentParser()
    parser.add_argument("--nicho", type=str, default=None)
    parser.add_argument("--ciudad", type=str, default="Santiago de Chile")
    parser.add_argument("--comuna", type=str, default="")
    parser.add_argument("--region", type=str, default="")
    parser.add_argument("--pais", type=str, default="Chile")
    parser.add_argument("--zoom", type=int, default=13)
    parser.add_argument("--cantidad", type=int, default=MAX_POR_CATEGORIA)
    parser.add_argument(
        "--concurrencia", type=int, default=int(os.getenv("SCRAPER_CONCURRENCIA", "3")),
        help="categorías scrapeadas en paralelo. Bajar a 1-2 si comparte VPS con el "
             "bridge de WhatsApp (dos Chromium en la misma máquina).")
    args = parser.parse_args()

    MAX_POR_CATEGORIA = args.cantidad

    pid_file = os.path.join(os.path.dirname(__file__), "scraper.pid")
    stop_file = os.path.join(os.path.dirname(__file__), ".stop")

    # Limpiar stop flag previo y escribir PID actual
    if os.path.exists(stop_file):
        os.remove(stop_file)
    with open(pid_file, "w") as f:
        f.write(str(os.getpid()))

    def cleanup():
        if os.path.exists(pid_file):
            os.remove(pid_file)

    inicio = datetime.now()
    log.info("=" * 60)
    partes_loc = []
    if args.comuna:
        partes_loc.append(args.comuna)
    if args.region:
        partes_loc.append(args.region)
    if args.ciudad:
        partes_loc.append(args.ciudad)
    if args.pais:
        partes_loc.append(args.pais)
    localizacion = ", ".join(partes_loc)
    log.info(f"  Scraper de leads — Google Maps / {localizacion} (Zoom: {args.zoom})  ")
    log.info(f"  Inicio: {inicio.strftime('%Y-%m-%d %H:%M:%S')}")
    log.info("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error("Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env")
        cleanup()
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    log.info("Conexion a Supabase OK")
    log.info(f"Modo headless: {HEADLESS}")

    if args.nicho:
        categorias = [args.nicho]
    else:
        categorias = CATEGORIAS.copy()
        random.shuffle(categorias)
    log.info(f"Categorias a procesar: {len(categorias)}")

    stats_global = {
        "nuevos": 0,
        "actualizados": 0,
        "descartados": 0,
        "por_categoria": {},
        "top_leads": [],
    }

    CONCURRENCIA = max(1, args.concurrencia)  # categorías en paralelo (configurable)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--lang=es-CL",
            ],
        )

        semaphore = asyncio.Semaphore(CONCURRENCIA)

        async def scrape_con_semaforo(categoria: str) -> None:
            async with semaphore:
                if os.path.exists(stop_file):
                    return
                ctx = await browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36"
                    ),
                    locale="es-CL",
                    timezone_id="America/Santiago",
                )
                page = await ctx.new_page()
                try:
                    stats_cat = await scrape_categoria(page, categoria, supabase, stats_global, args.ciudad, args.comuna, args.region, args.pais, args.zoom, stop_file)
                    stats_global["por_categoria"][categoria] = {
                        "nuevos": stats_cat["nuevos"],
                        "actualizados": stats_cat["actualizados"],
                        "descartados": stats_cat["descartados"],
                    }
                except Exception as e:
                    log.error(f"Error fatal en categoria '{categoria}': {e}")
                finally:
                    await ctx.close()

        await asyncio.gather(*[scrape_con_semaforo(cat) for cat in categorias])
        await browser.close()

    fin = datetime.now()
    duracion_min = round((fin - inicio).total_seconds() / 60, 1)

    # Top 10 leads por score
    top_leads = sorted(stats_global["top_leads"], key=lambda x: x["score"], reverse=True)[:10]

    total_procesados = (
        stats_global["nuevos"]
        + stats_global["actualizados"]
        + stats_global["descartados"]
    )
    # descartados = total - contactables (para el resumen)

    resumen = {
        "fecha": inicio.strftime("%Y-%m-%d %H:%M"),
        "duracion_min": duracion_min,
        "nuevos_leads": stats_global["nuevos"],
        "actualizados": stats_global["actualizados"],
        "descartados": stats_global["descartados"],
        "total_procesados": total_procesados,
        "por_categoria": stats_global["por_categoria"],
        "top_leads": top_leads,
    }

    log.info("=" * 60)
    log.info(f"  Nuevos leads:    {resumen['nuevos_leads']}")
    log.info(f"  Actualizados:    {resumen['actualizados']}")
    log.info(f"  Descartados:     {resumen['descartados']}")
    log.info(f"  Duracion:        {duracion_min} min")
    log.info("=" * 60)

    # Guardar historial de ejecución en Supabase
    try:
        supabase.table("scraper_runs").insert({
            "duracion_min": duracion_min,
            "nuevos_leads": resumen["nuevos_leads"],
            "actualizados": resumen["actualizados"],
            "descartados": resumen["descartados"],
            "total_procesados": resumen["total_procesados"],
        }).execute()
        log.info("Ejecucion registrada en scraper_runs")
    except Exception as e:
        log.error(f"Error registrando ejecucion: {e}")

    await notificar(resumen)
    cleanup()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        pid_file = os.path.join(os.path.dirname(__file__), "scraper.pid")
        if os.path.exists(pid_file):
            os.remove(pid_file)
        raise e
