# -*- coding: utf-8 -*-
"""Pruebas de la segunda verificacion de "tiene web" (slug de dominio + HTTP).

Mismo patron que test_identidad.py: se fingen playwright/supabase para poder
importar scraper.py sin esas dependencias pesadas, y se prueba la logica de
texto (barata, determinista) aparte de la parte que sale a la red.
"""
import asyncio
import sys
import os
import types

import httpx

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


# --- slug_dominio ------------------------------------------------------------
def test_arma_los_cuatro_candidatos_desde_el_nombre():
    assert scraper.slug_dominio("Corte y Estilo") == [
        "https://corteyestilo.cl",
        "https://www.corteyestilo.cl",
        "https://corteyestilo.com",
        "https://www.corteyestilo.com",
    ]


def test_normaliza_tildes_y_ene():
    # Ñam Ñam Pastelería -> namnampasteleria (sin tildes ni ñ, todo pegado)
    candidatos = scraper.slug_dominio("Ñam Ñam Pastelería")
    assert candidatos[0] == "https://namnampasteleria.cl"


def test_nombres_muy_cortos_no_generan_candidatos():
    """Un slug como "bar" o "sur" pega contra dominios reales sin relacion con
    el negocio -- el falso positivo ahi es peor que no verificar nada."""
    assert scraper.slug_dominio("AB") == []
    assert scraper.slug_dominio("") == []
    assert scraper.slug_dominio("123") == []


# --- buscar_web_por_nombre (HTTP fingido, sin red real) ----------------------
# Sin pytest-asyncio (el resto de la suite tampoco lo usa): se corre la
# corutina a mano con asyncio.run() dentro de una prueba sincrona normal.
def _con_transporte_fingido(handler, coro_factory):
    """Reemplaza httpx.AsyncClient por uno con transporte fingido durante la
    corrida, y lo restaura despues aunque la prueba falle."""
    original = httpx.AsyncClient

    def cliente_fingido(**kwargs):
        kwargs.pop("transport", None)
        return original(transport=httpx.MockTransport(handler), **kwargs)

    httpx.AsyncClient = cliente_fingido
    try:
        return asyncio.run(coro_factory())
    finally:
        httpx.AsyncClient = original


def test_encuentra_el_primer_dominio_que_responde():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "corteyestilo.cl":
            return httpx.Response(200)
        return httpx.Response(404)

    resultado = _con_transporte_fingido(handler, lambda: scraper.buscar_web_por_nombre("Corte y Estilo"))
    assert resultado == "https://corteyestilo.cl"


def test_ningun_dominio_responde_devuelve_none():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    resultado = _con_transporte_fingido(handler, lambda: scraper.buscar_web_por_nombre("Un Negocio Cualquiera"))
    assert resultado is None


def test_nombre_muy_corto_ni_siquiera_intenta_la_red():
    """Sin candidatos, no debe intentar ninguna conexion -- si esto llamara a
    la red real, no hay transporte fingido instalado y la prueba explota."""
    resultado = asyncio.run(scraper.buscar_web_por_nombre("AB"))
    assert resultado is None
