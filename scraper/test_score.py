"""El score tiene que ordenar la cola por quien COMPRA, no por quien esta peor.

El diagnostico del 15-sep lo dejo claro con tres leads de la misma sesion:

    Madepan, sin ninguna huella digital            -> 10/10
    Milano, fabricante con distribucion nacional   ->  5/10
    Pilar Adet, 4,8 con 294 resenas, cliente B2B   ->  5/10

Pasaba porque sumaba +15 por nota bajo 4,0 y +10 por menos de 20 resenas: el
razonamiento era "hay mas que mejorar", y el efecto era poner primero a los
negocios que menos pueden pagar.
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

from scraper import calcular_score  # noqa: E402


def test_ya_no_premia_la_mala_reputacion():
    malo = calcular_score("+56912345678", None, None, rating=3.2, num_resenas=4)
    bueno = calcular_score("+56912345678", None, None, rating=4.8, num_resenas=294)
    assert bueno > malo, "un negocio con 4,8 y 294 resenas compra; uno con 3,2 y 4 quiza ni sigue abierto"


def test_el_caso_real_pilar_adet_contra_un_negocio_sin_huella():
    # Pilar Adet: 4,8 con 294 resenas, vende al por mayor. Sacaba 5/10.
    pilar = calcular_score("+56912345678", "instagram.com/pilaradet", "Joyeria mayorista",
                           rating=4.8, num_resenas=294)
    # Madepan: sin huella digital, sacaba 10/10.
    madepan = calcular_score("+56912345678", None, None, rating=None, num_resenas=None)
    assert pilar > madepan


def test_una_nota_alta_sin_volumen_no_suma():
    # Centro Joyas: 5,0 con UNA resena. No dice nada del negocio.
    uno = calcular_score("+56912345678", None, None, rating=5.0, num_resenas=1)
    solo_telefono = calcular_score("+56912345678", None, None)
    assert uno == solo_telefono


def test_la_web_a_medias_es_la_senal_mas_fuerte():
    base = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=120)
    en_obra = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=120,
                             estado_web="en_obra")
    staging = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=120,
                             estado_web="staging")
    assert en_obra > base
    assert staging > base


def test_una_web_viva_no_suma_por_estar_rota():
    base = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=120)
    viva = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=120,
                          estado_web="viva")
    assert viva == base


def test_sin_telefono_el_lead_vale_mucho_menos():
    con = calcular_score("+56912345678", None, None)
    sin = calcular_score(None, None, None)
    assert con - sin >= 30, "sin canal de contacto no hay a quien escribirle"


def test_el_score_nunca_se_pasa_de_100():
    maximo = calcular_score("+56912345678", "instagram.com/x", "Una descripcion larga del negocio",
                            rating=4.9, num_resenas=5000, estado_web="en_obra")
    assert maximo <= 100


def test_un_lead_sin_nada_no_saca_puntaje_alto():
    assert calcular_score(None, None, None) == 0


def test_el_volumen_de_resenas_cuenta_aunque_la_nota_no_sea_alta():
    # Le Cafe de la Vie: 4,1 con 294 resenas. Es un negocio establecido: tiene
    # flujo, tiene clientes y tiene con que pagar. No puede caer al fondo por
    # no llegar al 4,3.
    con_volumen = calcular_score("+56912345678", None, None, rating=4.1, num_resenas=294)
    sin_volumen = calcular_score("+56912345678", None, None, rating=4.1, num_resenas=22)
    assert con_volumen > sin_volumen


def test_las_resenas_desproporcionadas_no_suman():
    # La importadora del Persa Bio Bio mostraba 10.657 resenas: son del persa
    # entero, porque la ficha esta categorizada como centro comercial.
    normal = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=800)
    absurdo = calcular_score("+56912345678", None, None, rating=4.5, num_resenas=10657)
    assert absurdo < normal


def test_muchas_resenas_con_nota_pesima_no_suman_por_volumen():
    # 2,8 con 400 resenas es un negocio con un problema, no una oportunidad.
    malo = calcular_score("+56912345678", None, None, rating=2.8, num_resenas=400)
    solo_telefono = calcular_score("+56912345678", None, None)
    assert malo == solo_telefono
