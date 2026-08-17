# -*- coding: utf-8 -*-
"""Pruebas de la lectura del numero de reseñas de Google Maps.

Existen por un bug que estuvo dando datos falsos durante 510 fichas sin que
nadie lo notara: el numero guardado era la calificacion por diez. Nadie lo vio
porque "43 reseñas" es un numero perfectamente creible — solo se destapo al
compararlo contra el crudo de la ficha.

La leccion, y el motivo de este archivo: la parte que interpreta texto se prueba
SIN navegador. Mientras vivio pegada al `page.query_selector`, no habia forma
barata de mirarla.
"""
import sys
import os
import types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# `scraper.py` importa Playwright y el cliente de Supabase al cargarse, pero lo
# que se prueba aca no toca ni el navegador ni la base. Se les pone un doble
# para que estas pruebas corran en cualquier maquina y en CI: si hicieran falta
# 300 MB de navegador para probar una expresion regular, nadie las correria —
# y no correrlas es exactamente como este bug duro 510 fichas.
if "playwright" not in sys.modules:
    falso_async = types.ModuleType("playwright.async_api")
    falso_async.async_playwright = None
    falso_async.Page = object
    falso_async.BrowserContext = object
    falso_async.TimeoutError = TimeoutError
    sys.modules["playwright"] = types.ModuleType("playwright")
    sys.modules["playwright.async_api"] = falso_async

if "supabase" not in sys.modules:
    falso_sb = types.ModuleType("supabase")
    falso_sb.create_client = None
    falso_sb.Client = object
    sys.modules["supabase"] = falso_sb

import scraper  # noqa: E402


# --- el caso que rompio en produccion --------------------------------------
def test_no_confunde_la_calificacion_con_las_resenas():
    """El aria-label de la calificacion dice '4,3 estrellas'.

    Antes se le sacaban los digitos y quedaba 43. Galindo tiene 7.885.
    """
    labels = ["4,3 estrellas", "7.885 reseñas"]
    assert scraper.numero_de_resenas(labels, "4,3\n(7.885)") == 7885


def test_toma_el_label_de_resenas_aunque_venga_primero_el_de_estrellas():
    labels = ["4,9 estrellas", "2.532 reseñas"]
    assert scraper.numero_de_resenas(labels, "") == 2532


def test_tolera_otros_idiomas_de_maps():
    assert scraper.numero_de_resenas(["1.204 reviews"], "") == 1204
    assert scraper.numero_de_resenas(["350 opiniones"], "") == 350


# --- el respaldo: el numero entre parentesis del texto ----------------------
def test_sin_label_util_usa_el_numero_entre_parentesis():
    """Es el mismo texto del que sale `info_texto`, que quedo bien guardado."""
    assert scraper.numero_de_resenas(["4,8 estrellas"], "4,8\n(256)") == 256


def test_el_respaldo_tolera_el_rango_de_precios_pegado():
    # Muchas fichas traen "4,9\n(35)·$15.000-20.000"
    assert scraper.numero_de_resenas([], "4,9\n(35)·$15.000-20.000") == 35


def test_separador_de_miles_con_punto_y_con_coma():
    assert scraper.numero_de_resenas([], "(10.657)") == 10657
    assert scraper.numero_de_resenas([], "(10,657)") == 10657


# --- cuando no se sabe, no se inventa --------------------------------------
def test_sin_datos_devuelve_none():
    assert scraper.numero_de_resenas([], "") is None
    assert scraper.numero_de_resenas([""], None) is None


def test_un_negocio_sin_resenas_no_deja_un_numero_falso():
    """Ficha nueva: tiene calificacion pero nadie la ha reseñado."""
    assert scraper.numero_de_resenas(["Sin reseñas"], "Sin reseñas") is None


def test_no_toma_cualquier_numero_suelto_del_texto():
    # Sin parentesis no hay reseñas: un numero suelto puede ser cualquier cosa.
    assert scraper.numero_de_resenas([], "4,3 estrellas") is None
