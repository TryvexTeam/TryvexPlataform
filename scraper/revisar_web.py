"""Mira QUE tiene la web de un lead, no solo si tiene una.

Por que existe: saber `tiene_web=true` no alcanzo. A Opticas Premium, que ya
tiene sitio, Vex igual le ofrecio "agenda de horas" y "cotizaciones online" --
cosas que su web YA hace. Para el dueno, eso se lee igual de mal que ofrecerle
una pagina: los dos casos dicen "no miramos tu negocio".

Lo que se busca son SENALES CONCRETAS en el HTML, no una opinion:

    reserva   -> se puede pedir hora ahi (Reservo, Agendapro, Calendly, Booksy,
                 un boton "agendar hora")
    cotiza    -> hay como pedir un presupuesto
    carrito   -> se puede comprar en linea
    whatsapp  -> hay un enlace directo a WhatsApp
    formulario-> hay un formulario de contacto
    chat      -> hay un chat en vivo

Limitaciones, dichas de frente:

* Solo lee el HTML que entrega el servidor. Un sitio hecho con React que arma
  todo con JavaScript puede tener agenda y que aca no se vea. Por eso el
  resultado distingue "no lo encontre" de "no lo tiene": `revisada` queda en
  False cuando ni siquiera se pudo leer la pagina.
* Un enlace a Reservo prueba que la agenda existe; su ausencia NO prueba que no.
  El sesgo es a proposito: preferimos callar una capacidad real antes que
  afirmar una que no esta.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from typing import Optional

import httpx

# Paginas internas que se prueban ademas de la home: es donde suele estar la
# agenda o el formulario cuando la home es solo una portada.
RUTAS_EXTRA = ("/contacto", "/reservas", "/agenda", "/hora", "/cotizacion")

# Cada senal: (nombre, patrones). Los patrones van contra el HTML en minuscula.
# Se prefieren dominios de proveedores reales antes que palabras sueltas: un
# enlace a reservo.cl es un hecho, la palabra "agenda" puede ser cualquier cosa.
SENALES: dict[str, tuple[str, ...]] = {
    "reserva": (
        r"reservo\.cl", r"agendapro", r"calendly\.com", r"booksy", r"simplybook",
        r"getmereserva", r"bookeo", r"square\.site", r"appointlet", r"setmore",
        r"cal\.com", r"timify", r"reservaonline",
        # Botones propios: se exige el verbo pegado al objeto para no pegarle a
        # "nuestra agenda de talleres" o "agenda de actividades".
        r"reserv(a|ar)\s+(tu\s+)?(hora|cita|turno)",
        r"agend(a|ar)\s+(tu\s+)?(hora|cita|turno)",
        r"pedir\s+(hora|cita)",
        r"book\s+(now|appointment)",
    ),
    "cotiza": (
        r"cotiz(a|ar|acion)", r"solicita(r)?\s+(tu\s+)?presupuesto",
        r"pide\s+tu\s+presupuesto", r"get\s+a\s+quote",
    ),
    "carrito": (
        r"woocommerce", r"shopify", r"add-to-cart", r"añadir\s+al\s+carrito",
        r"agregar\s+al\s+carrito", r"/cart", r"jumpseller", r"vtex", r"prestashop",
        r"bsale", r"mercadopago", r"webpay", r"transbank", r"flow\.cl",
    ),
    "whatsapp": (r"wa\.me/", r"api\.whatsapp\.com", r"web\.whatsapp\.com", r"whatsapp://"),
    "formulario": (r"<form", r"formulario\s+de\s+contacto", r"contact-form", r"wpcf7"),
    "chat": (r"tawk\.to", r"crisp\.chat", r"intercom", r"tidio", r"livechat", r"zendesk"),
}


@dataclass
class RevisionWeb:
    url: str
    revisada: bool = False
    """False = no se pudo leer la pagina. NO significa "no tiene nada"."""
    capacidades: list[str] = field(default_factory=list)
    paginas_leidas: int = 0
    error: Optional[str] = None

    def como_dict(self) -> dict:
        return {
            "url": self.url,
            "revisada": self.revisada,
            "capacidades": sorted(self.capacidades),
            "paginas_leidas": self.paginas_leidas,
            "error": self.error,
        }


def senales_en(html: str) -> set[str]:
    """Las capacidades que aparecen en este HTML."""
    texto = html.lower()
    return {
        nombre
        for nombre, patrones in SENALES.items()
        if any(re.search(p, texto) for p in patrones)
    }


async def revisar_web(url: str, timeout: float = 8.0) -> RevisionWeb:
    """Lee la home y algunas paginas internas, y devuelve que se encontro."""
    r = RevisionWeb(url=url)
    if not url or not url.strip():
        r.error = "sin url"
        return r

    base = url.strip().rstrip("/")
    encontradas: set[str] = set()

    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; TryvexBot/1.0)"},
        verify=False,
    ) as client:
        try:
            resp = await client.get(base)
            if resp.status_code >= 400:
                r.error = f"home respondio {resp.status_code}"
                return r
            r.revisada = True
            r.paginas_leidas = 1
            encontradas |= senales_en(resp.text)
        except Exception as e:  # noqa: BLE001 — el motivo se guarda, no se traga
            r.error = type(e).__name__
            return r

        # Muchos sitios responden 200 a CUALQUIER ruta y devuelven siempre la
        # home (lo vimos en fycsalon.com: 6 rutas, el mismo HTML de 60 KB). Sin
        # esto, `paginas_leidas` diria 6 habiendo leido una sola pagina.
        vistas = {hash(resp.text)}

        # Las internas son un extra: que fallen no invalida la revision.
        for ruta in RUTAS_EXTRA:
            if {"reserva", "cotiza"} <= encontradas:
                break  # ya sabemos lo que mas nos importa
            try:
                resp = await client.get(base + ruta)
                if resp.status_code >= 400:
                    continue
                if hash(resp.text) in vistas:
                    continue  # es la home otra vez
                vistas.add(hash(resp.text))
                r.paginas_leidas += 1
                encontradas |= senales_en(resp.text)
            except Exception:
                continue

    r.capacidades = sorted(encontradas)
    return r


async def revisar_varias(urls: list[str], concurrencia: int = 8) -> list[RevisionWeb]:
    sem = asyncio.Semaphore(concurrencia)

    async def una(u: str) -> RevisionWeb:
        async with sem:
            return await revisar_web(u)

    return await asyncio.gather(*(una(u) for u in urls))
