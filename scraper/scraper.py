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
import urllib.parse
import os
from datetime import datetime, timezone
from typing import List, Optional

from dotenv import load_dotenv
import unicodedata

import httpx
from playwright.async_api import async_playwright, Page, BrowserContext
from playwright.async_api import TimeoutError as PlaywrightTimeout
from supabase import create_client, Client

from notificaciones import notificar
from crm_map import a_crm, campos_update  # mapeo esquema viejo -> CRM de Tryvex
from revisar_web import revisar_web  # que ofrece el sitio del lead, no solo si tiene uno

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

# Si el negocio ya tiene sitio web: descartarlo (True, como siempre) o
# guardarlo igual (False). Se cambia desde el .env sin tocar codigo.
DESCARTAR_CON_WEB = os.getenv("SCRAPER_DESCARTAR_CON_WEB", "true").strip().lower() \
    not in ("false", "0", "no")

# Contador de modulo: stats_global es un parametro de scrape_categoria y no
# llega hasta extraer_negocio, asi que el descarte por web se cuenta aca.
DESCARTES = {"con_web": 0}

# ── Configuración ─────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
HEADLESS = os.getenv("HEADLESS", "true").lower() != "false"

LAT, LNG, ZOOM = -33.4489, -70.6693, 13
# Mira hasta 40 de la lista y saltea los conocidos → llega a más negocios NUEVOS
# (antes 20, que cada día eran los mismos de siempre y solo se re-procesaban).
MAX_POR_CATEGORIA = 40

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


def slug_dominio(nombre: str) -> list[str]:
    """Dominios candidatos derivados del nombre del negocio (ej. "Corte y
    Estilo" -> "corteyestilo.cl", "corteyestilo.com").

    Por que existe: Maps solo muestra el boton "Sitio web" si el dueño cargo
    la URL en su ficha -- muchos negocios chilenos SI tienen sitio real y
    nunca completaron ese campo, y hoy quedan marcados "tiene_web: false"
    aunque no sea cierto. Esto prueba la variante mas obvia del nombre antes
    de asumir que no tienen nada.

    Nombres muy cortos o genericos (< 4 caracteres tras limpiar) se
    descartan: un slug como "bar" o "sur" pega contra dominios reales que no
    tienen nada que ver con el negocio, y ahi el falso positivo es peor que
    no verificar nada.
    """
    base = unicodedata.normalize("NFKD", nombre.lower()).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "", base)
    if len(base) < 4:
        return []
    return [
        f"https://{base}.cl",
        f"https://www.{base}.cl",
        f"https://{base}.com",
        f"https://www.{base}.com",
    ]


async def buscar_web_por_nombre(nombre: str) -> Optional[str]:
    """Prueba los dominios candidatos de `slug_dominio` con una peticion HTTP
    real. Gratis (httpx ya es dependencia del cliente de Supabase, no se
    agrega nada nuevo) y sin ninguna API de busqueda de por medio.

    Limitacion conocida, a proposito no resuelta aca: bajo hit-rate (solo
    encuentra el caso en que el dominio calza con el nombre del negocio) y no
    distingue un sitio real de una pagina de dominio parqueado/en venta. Para
    los casos que esto no atrapa (dominio sin relacion al nombre, o el unico
    rastro esta en la bio de Instagram) hace falta una API de busqueda real
    -- eso queda pendiente de una decision de costo del equipo.
    """
    async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as client:
        for candidato in slug_dominio(nombre):
            try:
                r = await client.get(candidato)
                if r.status_code < 400:
                    return candidato
            except Exception:
                continue
    return None


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
    estado_web: Optional[str] = None,
) -> int:
    """Que tan bueno es este lead, de 0 a 100.

    🔴 Lo que media antes y por que estaba al reves (diagnostico del 15-sep):
    sumaba +15 por tener nota bajo 4,0 y +10 por tener menos de 20 resenas. O
    sea premiaba la MALA reputacion, con el razonamiento de "hay mas que
    mejorar". En la practica ordenaba la cola al reves:

        Madepan, sin ninguna huella digital        -> 10/10
        Milano, fabricante con distribucion nacional -> 5/10
        Pilar Adet, 4,8 con 294 resenas, cliente B2B -> 5/10

    Un negocio con 4,8 y 294 resenas tiene clientes, tiene plata y le importa
    su reputacion. Ese compra. Uno con 3,2 y 4 resenas puede que ni siga
    abierto.

    Ahora se mide lo que hace a un lead comprable:

      - que se le pueda hablar (telefono, redes)
      - que sea un negocio que funciona (buena nota CON volumen de resenas)
      - que ya haya decidido invertir en su presencia y haya quedado a medias
        (la web rota es la senal mas fuerte que tenemos)
    """
    score = 0

    # Poder contactarlo sigue siendo lo primero: sin canal no hay lead.
    if telefono:
        score += 40
    if redes:
        score += 15
    if info_texto and len(info_texto.strip()) > 10:
        score += 5

    # Un negocio que funciona: buena nota, pero solo si hay volumen detras. Un
    # 5,0 con una resena no dice nada -- y de hecho citarlo suena a burla.
    if rating is not None and num_resenas is not None:
        if rating >= 4.5 and num_resenas >= 100:
            score += 25
        elif rating >= 4.3 and num_resenas >= 40:
            score += 18
        elif rating >= 4.0 and num_resenas >= 20:
            score += 10

    # El VOLUMEN por si solo dice algo que la nota no: cuanta gente pasa por
    # ahi. Un local con 2.556 resenas es un negocio establecido aunque su nota
    # sea 4,1 — tiene clientes, tiene flujo y tiene con que pagar.
    #
    # Sin esto, Pizzeria Alleria (4,6 con 2.556) quedaba en el mismo escalon
    # que un local con 20 resenas, y Le Cafe de la Vie (4,1 con 294) caia al
    # fondo por no llegar al 4,3.
    #
    # ⚠️ Con un tope: arriba de ~3.000 resenas para un negocio de barrio la
    # ficha suele estar mal categorizada y las resenas son de otra cosa (la
    # importadora del Persa Bio Bio mostraba 10.657, que son del persa entero).
    if num_resenas is not None and (rating is None or rating >= 3.5):
        if 150 <= num_resenas <= 3000:
            score += 10
        elif 40 <= num_resenas < 150:
            score += 5

    # ⭐ La senal mas fuerte: ya decidio que necesita presencia digital, puso
    # plata y quedo a medias. Es el lead que mas rapido cierra.
    if estado_web in ("en_obra", "staging"):
        score += 20
    elif estado_web in ("caida", "vacia"):
        score += 15

    return min(score, 100)


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


def _norm_nombre(n: str) -> str:
    """Normaliza un nombre para comparar (minúsculas, sin espacios de más)."""
    return re.sub(r"\s+", " ", (n or "").strip().lower())


async def nombres_existentes(supabase: Client, nicho: str) -> set:
    """Nombres de negocio que YA están en el CRM para ese nicho (normalizados).
    Se carga una vez por categoría para SALTEAR los conocidos sin abrirlos
    (que el scraper no pierda tiempo re-procesando lo que ya tiene)."""
    try:
        res = await _in_thread(
            lambda: supabase.table("fact_leads")
            .select("nombre_negocio").eq("nicho", nicho).limit(5000).execute()
        )
        return {_norm_nombre(r["nombre_negocio"]) for r in (res.data or [])}
    except Exception as e:
        log.warning(f"No pude cargar existentes de '{nicho}': {e}")
        return set()


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


async def obtener_hrefs_resultados(page: Page) -> list[tuple[str, str]]:
    """Devuelve [(nombre, href), ...] de la lista de Maps.
    El nombre sale del aria-label del <a> SIN abrir el negocio → permite saltear
    los que ya tenemos antes de gastar tiempo abriéndolos (no re-procesar)."""
    out: list[tuple[str, str]] = []
    try:
        elements = await page.query_selector_all("a.hfpxzc")
        for el in elements[:MAX_POR_CATEGORIA]:
            href = await el.get_attribute("href")
            nombre = (await el.get_attribute("aria-label")) or ""
            if href:
                out.append((nombre.strip(), href))
    except Exception as e:
        log.warning(f"Error obteniendo resultados: {e}")
    return out


# ── Extracción de datos por negocio ───────────────────────────────────────────
def es_telefono_chileno(num: Optional[str]) -> bool:
    """Si esto no parece un telefono chileno, no lo es.

    Existe por los 75 leads que llegaron con el CODIGO POSTAL en el campo
    telefono: "Av. Italia 1350, 7501451 Providencia" dejaba telefono=7501451.
    El culpable es el tercer intento de extraer_telefono, que barre los
    aria-label de los botones con un regex generico -- y el boton de copiar
    direccion trae la direccion entera, codigo postal incluido.

    Un codigo postal chileno son 7 digitos. Un telefono, 8 o mas:
      movil     9 XXXX XXXX          -> 9 digitos
      fijo      2 XXXX XXXX (Stgo)   -> 9 digitos
      con pais  56 9 XXXX XXXX       -> 11 digitos
    Por eso el corte esta en 8: deja pasar cualquier telefono real y frena
    el codigo postal, que es lo unico de 7 que aparecia aca.
    """
    d = re.sub(r"\D", "", num or "")
    if len(d) < 8:
        return False
    # 7 digitos con un prefijo pegado tampoco: 56 + codigo postal.
    if d.startswith("56") and len(d) == 9:
        return False
    return True


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


def _a_entero(texto: str) -> Optional[int]:
    """'2.532' o '2,532' -> 2532. None si no queda un numero limpio."""
    solo_digitos = re.sub(r"[.,\s]", "", texto)
    return int(solo_digitos) if solo_digitos.isdigit() else None


def numero_de_resenas(aria_labels: List[str], texto_bloque: str) -> Optional[int]:
    """Cuantas reseñas tiene el negocio, leidas del bloque de calificacion.

    Esta separada de la pagina para poder probarla sin abrir un navegador, que
    es justo lo que faltaba cuando esto se rompio.

    EL BUG QUE ARREGLA (17-ago-2026): antes se tomaba el PRIMER
    `span[aria-label]` de `div.F7nice` y se le sacaba el primer numero. Ese
    primer span es el de la CALIFICACION: su aria-label dice "4,3 estrellas".
    Sacarle los digitos daba "43". En las 510 fichas guardadas, el numero de
    reseñas resulto ser exactamente la calificacion por diez.

    No es un detalle de datos: ese numero iba camino a un mensaje de WhatsApp a
    un cliente. Galindo tiene 7.885 reseñas y el sistema decia 43.

    Dos caminos, en orden:
      1. El aria-label que hable de reseñas/opiniones (Maps cambia de idioma).
      2. El numero entre parentesis del texto del bloque ("4,3\\n(7.885)"), que
         es de donde sale `info_texto` — el campo que SI quedo bien.
    """
    for label in aria_labels:
        if not label:
            continue
        if re.search(r"rese|opini|review|valorac", label, re.I):
            m = re.search(r"([\d][\d.,]*)", label)
            if m:
                n = _a_entero(m.group(1))
                if n is not None:
                    return n

    m = re.search(r"\(\s*([\d][\d.,]*)\s*\)", texto_bloque or "")
    if m:
        return _a_entero(m.group(1))

    return None


async def extraer_num_resenas(page: Page) -> Optional[int]:
    try:
        elementos = await page.query_selector_all("div.F7nice span[aria-label]")
        labels = [((await el.get_attribute("aria-label")) or "") for el in elementos]

        texto_bloque = ""
        bloque = await page.query_selector("div.F7nice")
        if bloque:
            texto_bloque = (await bloque.inner_text()) or ""

        return numero_de_resenas(labels, texto_bloque)
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


def id_de_google(url: str) -> Optional[str]:
    """El identificador unico que Google le da a cada local, sacado de la URL.

    Hoy un negocio se reconoce por nombre + rubro, y por eso hay fichas
    duplicadas: "Salon Regias" esta dos veces, una como peluqueria y otra como
    centro de estetica. Es el MISMO local. Este identificador no cambia aunque
    le cambien el nombre al negocio, asi que sirve para no duplicar nunca mas.

    Vive en el `data=` de la URL de la ficha, con la forma `!1s0x<algo>:0x<algo>`.
    Se devuelve el par completo porque la primera mitad sola se repite entre
    locales cercanos: lo que identifica es el par.
    """
    if not url:
        return None
    m = re.search(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", url, re.I)
    return m.group(1).lower() if m else None


# Como Maps dice que un negocio ya no atiende, en los idiomas en que puede
# aparecer la ficha. Se listan como frases y no como palabras sueltas: "cerrado"
# a secas es el estado normal de cualquier negocio fuera de horario, y tomarlo
# por cierre definitivo descartaria media cartera.
_FRASES_CIERRE = (
    "permanentemente cerrado",
    "cerrado permanentemente",
    "permanently closed",
)


def esta_cerrado_para_siempre(texto: str) -> bool:
    """¿La ficha dice que el negocio cerro definitivamente?

    Escribirle a un negocio que cerro es la peor carta de presentacion posible,
    y hoy no teniamos como saberlo.

    ⚠️ "Cerrado temporalmente" NO cuenta: ese vuelve a abrir, y descartarlo
    seria perder un lead bueno.
    """
    if not texto:
        return False
    limpio = texto.lower()
    return any(f in limpio for f in _FRASES_CIERRE)


async def extraer_categoria(page: Page) -> Optional[str]:
    """El rubro que Google le pone al negocio, no el que nosotros buscamos.

    Hoy se guarda "barberias" porque es lo que se puso en la busqueda. Google
    dice cosas mas precisas: "Barberia", "Peluqueria masculina", "Salon de
    belleza". Sirve para escribir mas al grano sin inventar nada.
    """
    for selector in ['button[jsaction*="category"]', "button.DkEaL", ".YhemCb"]:
        try:
            el = await page.query_selector(selector)
            if el:
                texto = (await el.inner_text()).strip()
                if texto and len(texto) < 60:
                    return texto
        except Exception:
            continue
    return None


async def cerro_para_siempre(page: Page) -> bool:
    """¿La ficha avisa que el negocio cerro definitivamente?"""
    for selector in ['.fCEvvc', '[aria-label*="ermanentemente"]', ".o0Svhf"]:
        try:
            el = await page.query_selector(selector)
            if el and esta_cerrado_para_siempre((await el.inner_text()) or ""):
                return True
        except Exception:
            continue
    return False


def limpiar_url(href: str) -> str:
    """Se queda con la direccion y tira lo que el dueño pego al lado.

    🔴 El campo "sitio web" de Maps lo escribe el dueño a mano, y a veces mete
    mas de una cosa. Caso real del 16-sep, en la corrida de prueba:

        http://www.vets.cl/%20,%20atencioncliente@vets.cl

    Es el sitio, una coma y el correo, todo en el mismo campo. Guardado asi da
    404 -- y el scraper lo leia como "su web esta caida" cuando vets.cl
    responde 200. El sitio estaba sano; lo roto era nuestro dato.

    Se corta en el primer espacio (venga literal o como %20) y en la coma, y
    se descarta lo que quede si trae arroba.
    """
    u = (href or "").strip()
    if not u:
        return u
    u = urllib.parse.unquote(u)
    # Cualquier espacio en blanco corta: el resto es lo que el dueño pego al lado.
    u = u.split()[0] if u.split() else ""
    for sep in (",", ";"):
        if sep in u:
            u = u.split(sep, 1)[0]
    u = u.strip().rstrip(",;")
    # Si lo que queda es un correo, no es una web.
    if "@" in u.split("/")[-1]:
        u = u.rsplit("/", 1)[0]
    return u.strip()


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
    url_web: Optional[str] = None
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
                    url_web = limpiar_url(href)
    except Exception:
        pass

    # El filtro historico era "si tiene web, no es lead" — tenia sentido cuando
    # lo unico que se vendia eran paginas. Hoy tambien se vende automatizacion,
    # SaaS e IA aplicada, y para eso tener web es BUENA senal. Se deja
    # configurable y se registra, porque antes se descartaba en silencio y
    # nadie sabia cuantos de los ~580 descartes diarios eran por esto.
    # 🔴 Y antes de descartar por tener web, hay que MIRAR esa web. Un dominio
    # que responde 200 no es un negocio con sitio andando: puede decir "volvemos
    # pronto", ser un staging olvidado o un dominio en venta.
    #
    # Ese es justo el mejor lead que existe y lo estabamos botando todos los
    # dias: ya decidio que necesita web, ya puso plata, y quedo a medias. La
    # venta no es "hagamos un sitio", es "terminemos lo que empezaste". Casos
    # reales del diagnostico del 15-sep: Santo Pan ("en mantencion"), La Tienda
    # de Ruben (tienda en wpcomstaging.com), Ivan Gonzalez (bucle de redirects,
    # 16 s y 0 bytes).
    revision = None
    if tiene_web and url_web:
        try:
            revision = await revisar_web(url_web)
        except Exception as e:
            log.info(f"  no se pudo revisar la web de {nombre}: {type(e).__name__}")

    if tiene_web and revision is not None and revision.es_oportunidad:
        DESCARTES["web_a_medias"] = DESCARTES.get("web_a_medias", 0) + 1
        log.info(f"  ⭐ LEAD BUENO (web {revision.estado}): {nombre} -> {url_web}")
        # No se descarta: sigue de largo y se guarda con el hallazgo.
    elif tiene_web:
        DESCARTES["con_web"] += 1
        log.info(f"  descartado (ya tiene web): {nombre} -> {url_web}")
        if DESCARTAR_CON_WEB:
            return None

    # Maps solo muestra el sitio si el dueño cargó la URL en su ficha. Antes de
    # asumir "no tiene web" se prueba el dominio obvio a partir del nombre
    # (PR #211). Esto evita el caso reportado: escribirle a un negocio que SÍ
    # tiene sitio, diciéndole que no tiene.
    # 🔴 La web que sale de ADIVINAR el dominio NO es la web del negocio: es un
    # dominio que se llama parecido. El 15-sep, "Opticas Premium" de Santiago
    # quedo con opticaspremium.com, que es una empresa PERUANA. Lo mismo con
    # Optica Morales, Optica San Cristobal, Restaurante Don Pepe (Peru) y
    # Ferreteria Santa Rosa (Argentina). Vex le escribio a un chileno hablandole
    # del negocio de otro.
    #
    # Por eso `tiene_web` queda en None (= "no sabemos") y no en True: se guarda
    # la pista para que alguien la confirme, sin afirmarla. Confirmada de verdad
    # es solo la que trae Maps en la ficha, que la cargo el dueño.
    web_confirmada = tiene_web
    if not tiene_web:
        web_por_nombre = await buscar_web_por_nombre(nombre)
        if web_por_nombre:
            tiene_web = None
            url_web = web_por_nombre
            log.info(f"  posible web por nombre (SIN CONFIRMAR): {nombre} -> {web_por_nombre}")

    # Un negocio que cerro definitivamente no es un lead: escribirle es la peor
    # carta de presentacion posible. Se descarta antes de gastar tiempo en el.
    if await cerro_para_siempre(page):
        log.info(f"  descartado (cerro para siempre): {nombre}")
        return None

    telefono = await extraer_telefono(page)
    # Un codigo postal no es un telefono. Ver es_telefono_chileno.
    if telefono and not es_telefono_chileno(telefono):
        log.info(f"telefono descartado por no parecerlo: {telefono!r}")
        telefono = None
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

    # Si tiene sitio, se mira QUE ofrece. Saber que tiene web no alcanzo: a un
    # lead con agenda online igual se le ofrecia "agenda de horas", y eso se lee
    # tan mal como ofrecerle una pagina al que ya tiene una. Que falle no
    # invalida el lead: queda sin el dato y el redactor lo trata como
    # "no sabemos", que es lo honesto.
    # Solo se revisa la web CONFIRMADA. Mirar lo que ofrece un sitio que quiza
    # no es suyo es peor que no mirar nada: le terminamos diciendo "ya tienes
    # agenda" por la agenda de otra empresa.
    # La revision ya se hizo mas arriba, al decidir si se descartaba. Se
    # reutiliza en vez de pedir la pagina dos veces.
    web_capacidades = revision.como_dict() if (web_confirmada and revision is not None) else None
    if web_capacidades and web_capacidades["capacidades"]:
        log.info(f"  web de {nombre}: {', '.join(web_capacidades['capacidades'])}")

    return {
        "nombre": nombre,
        "google_place_id": id_de_google(page.url),
        "categoria_google": await extraer_categoria(page),
        "telefono": telefono,
        "info_texto": info_texto,
        "redes": redes,
        "tiene_web": tiene_web,
        "url_web": url_web,
        "web_capacidades": web_capacidades,
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
    refrescar: bool = False,
) -> dict:
    log.info(f"[{categoria}] Iniciando busqueda...")
    stats_cat = {"nuevos": 0, "actualizados": 0, "descartados": 0, "saltados": 0, "top": []}

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
    await scroll_panel(page, veces=12)  # más scroll → más candidatos (miramos hasta 40)

    resultados = await obtener_hrefs_resultados(page)
    log.info(f"[{categoria}] {len(resultados)} resultados encontrados")

    if not resultados:
        return stats_cat

    # Nombres que YA tenemos de este nicho → los salteamos SIN abrirlos, para no
    # perder tiempo re-procesando lo conocido (pedido de Cristian: traer NUEVOS).
    # En modo refrescar se re-procesan los conocidos a proposito: es la unica
    # forma de que los leads ya guardados reciban los datos nuevos (identificador
    # de Google, rubro real) sin borrar la cartera y empezar de cero.
    ya_tengo = set() if refrescar else await nombres_existentes(supabase, categoria)

    for i, (nombre_lista, href) in enumerate(resultados):
        if stop_file and os.path.exists(stop_file):
            log.info(f"[{categoria}] Stop flag detectado, deteniendo.")
            break
        # Saltear conocido ANTES de abrirlo (ahorra el goto + extracción).
        if nombre_lista and _norm_nombre(nombre_lista) in ya_tengo:
            stats_cat["saltados"] = stats_cat.get("saltados", 0) + 1
            stats_global["saltados"] = stats_global.get("saltados", 0) + 1
            log.debug(f"[{categoria}] #{i + 1} '{nombre_lista}' ya está, salteado")
            continue
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
                # El estado de su web pesa en el score: una a medio hacer es la
                # senal mas fuerte de que ese negocio compra.
                (datos.get("web_capacidades") or {}).get("estado"),
            )

            # ⚠️ Este dict se arma copiando campo por campo desde `datos`, asi
            # que un campo nuevo hay que agregarlo TAMBIEN aca. Si no, se
            # extrae bien de Maps y se pierde en el camino, sin ningun error:
            # paso el 17-ago con estos dos, que llegaron vacios a la base
            # despues de haberlos leido correctamente de la ficha.
            lead = {
                "nombre": datos["nombre"],
                "google_place_id": datos.get("google_place_id"),
                "categoria_google": datos.get("categoria_google"),
                "telefono": datos["telefono"],
                "info_texto": datos["info_texto"],
                "redes": datos["redes"],
                "tiene_web": datos.get("tiene_web", False),
                "url_web": datos.get("url_web"),
                # Que ofrece su sitio y en que estado esta. Sin esta linea el
                # scraper lo averigua, lo usa para el score, y lo pierde aca
                # mismo -- que es exactamente lo que advierte el comentario de
                # arriba y lo que paso en la primera corrida del 16-sep:
                # Pasteleria Vienesa quedo guardada sin el hallazgo.
                "web_capacidades": datos.get("web_capacidades"),
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
        f"{stats_cat['descartados']} descartados, "
        f"{stats_cat.get('saltados', 0)} ya-conocidos-salteados"
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
        "--refrescar",
        action="store_true",
        help=(
            "Re-procesa tambien los negocios que ya estan guardados, en vez de "
            "saltearlos. Sirve para que los leads viejos reciban los datos que "
            "el scraper aprendio a sacar despues de haberlos guardado. Es mas "
            "lento: abre cada ficha."
        ),
    )
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
        "saltados": 0,
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
                    stats_cat = await scrape_categoria(page, categoria, supabase, stats_global, args.ciudad, args.comuna, args.region, args.pais, args.zoom, stop_file, args.refrescar)
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
        "saltados": stats_global.get("saltados", 0),
        "total_procesados": total_procesados,
        "por_categoria": stats_global["por_categoria"],
        "top_leads": top_leads,
    }

    log.info("=" * 60)
    log.info(f"  Nuevos leads:    {resumen['nuevos_leads']}")
    log.info(f"  Actualizados:    {resumen['actualizados']}")
    log.info(f"  Descartados:     {resumen['descartados']}")
    log.info(f"    ...de esos, ya tenian web: {DESCARTES['con_web']}")
    log.info(f"  Ya conocidos (salteados, no re-procesados): {resumen['saltados']}")
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
