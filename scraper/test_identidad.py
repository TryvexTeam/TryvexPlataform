# -*- coding: utf-8 -*-
"""Pruebas del identificador de Google y del cierre definitivo.

Van sin navegador a proposito, igual que test_resenas.py: la parte que
interpreta texto se prueba barato, o no se prueba nunca — que es como el bug de
las reseñas duro 510 fichas.
"""
import sys
import os
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

import scraper  # noqa: E402


# --- el identificador unico de Google --------------------------------------
def test_saca_el_par_completo_de_la_url():
    url = ("https://www.google.com/maps/place/Barberia/@-33.4,-70.6,17z/"
           "data=!3m1!4b1!4m6!3m5!1s0x9662c5a1b2c3d4e5:0xf1e2d3c4b5a69788!8m2!3d-33.4")
    assert scraper.id_de_google(url) == "0x9662c5a1b2c3d4e5:0xf1e2d3c4b5a69788"


def test_devuelve_siempre_en_minusculas():
    """Para que el mismo local no se vea como dos por el uso de mayusculas."""
    url = "https://maps.google.com/?data=!1s0X9662C5A1:0XF1E2D3C4"
    assert scraper.id_de_google(url) == "0x9662c5a1:0xf1e2d3c4"


def test_una_url_sin_identificador_no_inventa_uno():
    assert scraper.id_de_google("https://www.google.com/maps/search/barberias") is None
    assert scraper.id_de_google("") is None
    assert scraper.id_de_google(None) is None


def test_no_confunde_otras_partes_del_data_con_el_identificador():
    # El `data=` trae muchos numeros; solo el que viene tras !1s identifica.
    url = "https://www.google.com/maps/place/X/data=!4m6!3m5!8m2!3d-33.4!4d-70.6"
    assert scraper.id_de_google(url) is None


# --- cerrado definitivamente -----------------------------------------------
def test_detecta_el_cierre_definitivo():
    assert scraper.esta_cerrado_para_siempre("Permanentemente cerrado") is True
    assert scraper.esta_cerrado_para_siempre("Cerrado permanentemente") is True
    assert scraper.esta_cerrado_para_siempre("Permanently closed") is True


def test_no_confunde_estar_cerrado_ahora_con_haber_cerrado():
    """El error caro: "Cerrado" a secas es el estado normal fuera de horario.

    Tomarlo por cierre definitivo descartaria media cartera.
    """
    assert scraper.esta_cerrado_para_siempre("Cerrado · Abre a las 9 a.m.") is False
    assert scraper.esta_cerrado_para_siempre("Cerrado") is False
    assert scraper.esta_cerrado_para_siempre("Abierto · Cierra a las 8 p. m.") is False


def test_un_cierre_temporal_no_cuenta():
    """Ese vuelve a abrir: descartarlo seria perder un lead bueno."""
    assert scraper.esta_cerrado_para_siempre("Cerrado temporalmente") is False


def test_sin_texto_no_asume_nada():
    assert scraper.esta_cerrado_para_siempre("") is False
    assert scraper.esta_cerrado_para_siempre(None) is False
