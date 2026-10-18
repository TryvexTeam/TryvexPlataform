"""Una web ADIVINADA por el nombre no es la web del negocio.

El 15-sep-2026, "Opticas Premium" (Santiago, +56 2 2763 5637) quedo con
opticaspremium.com, que es una empresa PERUANA -- bandera de Peru en la
cabecera, ventas@opticaspremium.com, WhatsApp +51 923055671. Vex le escribio
a un chileno hablandole de la agenda y las cotizaciones de otra empresa.

No fue un caso aislado: de 69 leads con url_web, **67 eran adivinadas** y solo
2 venian de la ficha de Google Maps. Entre las adivinadas habia sitios de Peru,
Argentina y Mexico.

La regla que estos tests fijan: adivinar el dominio sirve para dejar una PISTA
(`url_web`), nunca para afirmar que el negocio tiene sitio (`tiene_web`).
"""

import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Mismo patron que test_web_por_nombre.py: se fingen playwright y supabase para
# poder importar scraper.py sin esas dependencias pesadas.
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

from scraper import slug_dominio  # noqa: E402


def es_adivinada(nombre: str, url: str) -> bool:
    """¿Esta url salio de adivinar el dominio a partir del nombre?"""
    return url in slug_dominio(nombre)


def test_el_caso_real_que_lo_destapo():
    assert es_adivinada("Opticas Premium", "https://www.opticaspremium.com")


def test_los_otros_casos_reales():
    assert es_adivinada("Optica Morales", "https://opticamorales.com")
    assert es_adivinada("Optica San Cristobal", "https://opticasancristobal.com")
    assert es_adivinada("RESTAURANTE DON PEPE", "https://www.restaurantedonpepe.com")


def test_una_web_de_maps_no_se_confunde_con_adivinada():
    # Estas dos son las unicas confirmadas de la cartera: las cargo el dueno en
    # su ficha, y por eso NO coinciden con el slug de su nombre.
    assert not es_adivinada("Que Leo", "https://queleochile.cl/locales-santiago/")
    assert not es_adivinada("Que Leo Forestal", "https://www.espacioforestal.cl/")


def test_el_nombre_corto_no_genera_candidatos():
    # "bar" o "sur" pegarian contra dominios reales sin relacion con el negocio.
    assert slug_dominio("Bar") == []
    assert slug_dominio("A B") == []


def test_las_tildes_no_cambian_el_slug():
    assert "https://opticapremium.cl" in slug_dominio("Óptica Premium")
