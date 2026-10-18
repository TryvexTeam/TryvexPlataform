"""El campo "sitio web" de Maps lo escribe el dueño, y a veces mete dos cosas.

Caso real del 16-sep, en la corrida de prueba de 5 antes de encender el timer:

    http://www.vets.cl/%20,%20atencioncliente@vets.cl

Es el sitio, una coma y el correo. Guardado asi da 404, y el scraper lo leyo
como "su web esta caida" -- cuando vets.cl responde 200. El sitio estaba sano;
lo roto era nuestro dato. Ese lead entro con score 55 por una caida inventada.
"""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if "playwright" not in sys.modules:
    fa = types.ModuleType("playwright.async_api")
    fa.async_playwright = None
    fa.Page = object
    fa.BrowserContext = object
    fa.TimeoutError = TimeoutError
    sys.modules["playwright"] = types.ModuleType("playwright")
    sys.modules["playwright.async_api"] = fa

if "supabase" not in sys.modules:
    fsb = types.ModuleType("supabase")
    fsb.create_client = None
    fsb.Client = object
    sys.modules["supabase"] = fsb

from scraper import limpiar_url  # noqa: E402


def test_el_caso_real_de_vets():
    sucia = "http://www.vets.cl/%20,%20atencioncliente@vets.cl"
    assert limpiar_url(sucia) == "http://www.vets.cl/"


def test_una_url_limpia_no_se_toca():
    for u in ("https://tryvex.tech", "http://www.ejemplo.cl/", "https://a.cl/b/c?d=1"):
        assert limpiar_url(u) == u


def test_corta_en_la_coma_aunque_no_haya_espacio():
    assert limpiar_url("https://ejemplo.cl,otracosa.cl") == "https://ejemplo.cl"


def test_corta_en_el_espacio_literal():
    assert limpiar_url("https://ejemplo.cl contacto@ejemplo.cl") == "https://ejemplo.cl"


def test_saca_el_correo_pegado_al_final():
    assert limpiar_url("https://ejemplo.cl/hola@ejemplo.cl") == "https://ejemplo.cl"


def test_una_cadena_vacia_no_revienta():
    assert limpiar_url("") == ""
    assert limpiar_url("   ") == ""
