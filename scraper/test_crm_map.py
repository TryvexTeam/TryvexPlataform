# -*- coding: utf-8 -*-
"""Pruebas del mapeo del scraper al CRM.

Se prueban las columnas que antes no existian y los datos terminaban aplastados
dentro de `notas`, como texto suelto. Ahi no se podian filtrar ni los veia el
redactor de mensajes: la lista mas util del equipo —"con buena reputacion, con
Instagram y sin web"— era imposible de pedir.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import crm_map  # noqa: E402


LEAD = {
    "nombre": "Casa Salvo Café",
    "rating": 4.9,
    "num_resenas": 2532,
    "horario": "Abierto · Cierra a las 8 p. m.",
    "redes": "https://instagram.com/casasalvo.cl?igshid=abc, https://instagram.com/casasalvo.cl",
    "direccion": "Av. Salvador 2000, 7500000 Providencia, Región Metropolitana",
    "info_texto": "4,9\n(2532)",
}


# --- las columnas nuevas ---------------------------------------------------
def test_la_reputacion_va_a_su_columna():
    m = crm_map.a_crm(LEAD)
    assert m["google_rating"] == 4.9
    assert m["google_resenas"] == 2532


def test_el_horario_va_a_su_columna():
    assert crm_map.a_crm(LEAD)["horario"] == "Abierto · Cierra a las 8 p. m."


def test_los_datos_siguen_tambien_en_notas():
    """El equipo los lee ahi hoy; sacarlos de golpe seria romperles la vista."""
    notas = crm_map.a_crm(LEAD)["notas"]
    assert "Rating Google: 4.9" in notas
    assert "Horario:" in notas


def test_un_lead_sin_datos_no_inventa_columnas():
    m = crm_map.a_crm({"nombre": "Sin nada"})
    assert m["google_rating"] is None
    assert m["google_resenas"] is None
    assert m["horario"] is None
    assert m["instagram"] is None


# --- Instagram -------------------------------------------------------------
def test_saca_el_instagram_y_le_quita_el_seguimiento():
    # Venia duplicado y con `?igshid=...`, que no es parte del perfil.
    assert crm_map.instagram_de(LEAD["redes"]) == "https://instagram.com/casasalvo.cl"


def test_acepta_el_www():
    assert (
        crm_map.instagram_de("https://www.instagram.com/alleria_pizza")
        == "https://www.instagram.com/alleria_pizza"
    )


def test_ignora_otras_redes():
    assert crm_map.instagram_de("https://www.facebook.com/RtdAysen/") is None


def test_sin_redes_no_hay_instagram():
    assert crm_map.instagram_de("") is None
    assert crm_map.instagram_de(None) is None


# --- refresco de un lead que ya existe -------------------------------------
def test_al_refrescar_tambien_se_actualizan_las_columnas_nuevas():
    """Sin esto, los leads ya guardados nunca recibirian los datos nuevos."""
    u = crm_map.campos_update(LEAD)
    assert u["google_resenas"] == 2532
    assert u["instagram"] == "https://instagram.com/casasalvo.cl"
    assert u["horario"] == "Abierto · Cierra a las 8 p. m."
