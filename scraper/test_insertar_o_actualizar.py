"""Preguntar "¿ya tengo este negocio?" por el nombre no sirve: el nombre cambia.

La tabla tiene una llave UNICA por google_place_id. El scraper buscaba solo
por (nombre, nicho), asi que cuando el nombre no calzaba intentaba insertar y
la base lo rechazaba con un 23505. Paso 68 veces sin que nadie lo mirara.

Los tres casos reales de la corrida del 16-sep, todos el mismo negocio ya
guardado con otro nombre:

    Chile Psicologos        vs  Chile Psicólogos          (una tilde)
    SDS Clinicas Dentales   vs  SDS Clinicas Dentales💎🇨🇱  (emojis)
    Clinica Veterinaria My Konan Pet                      (repite desde el 15)

Y lo peor no era el error en el log: esos negocios NUNCA se actualizaban. Un
telefono nuevo o una web recien hecha no llegaba jamas a su ficha.
"""

import asyncio
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

from scraper import insertar_o_actualizar  # noqa: E402


class Respuesta:
    def __init__(self, data):
        self.data = data


class ConsultaFalsa:
    """Anota por que campo se pregunto y devuelve lo que el caso defina."""

    def __init__(self, tabla):
        self.tabla = tabla
        self.filtros = {}

    def select(self, *_a, **_k):
        return self

    def insert(self, payload):
        self.tabla.insertados.append(payload)
        return self

    def update(self, payload):
        self.tabla.actualizados.append(payload)
        return self

    def eq(self, campo, valor):
        self.filtros[campo] = valor
        return self

    def execute(self):
        if "google_place_id" in self.filtros:
            self.tabla.busquedas.append("google_place_id")
            return Respuesta(self.tabla.por_place_id)
        if "nombre_negocio" in self.filtros:
            self.tabla.busquedas.append("nombre_negocio")
            return Respuesta(self.tabla.por_nombre)
        return Respuesta([])


class SupabaseFalso:
    def __init__(self, por_place_id=(), por_nombre=()):
        self.por_place_id = list(por_place_id)
        self.por_nombre = list(por_nombre)
        self.busquedas = []
        self.insertados = []
        self.actualizados = []

    def table(self, _nombre):
        return ConsultaFalsa(self)


LEAD = {
    "nombre": "SDS Clinicas Dentales",
    "google_place_id": "0x9662c5a1a6d3bf15:0x1ca81d95e1c401a",
    "telefono": "+56912345678",
    "nicho": "dentistas",
    "score": 70,
    "estado": "nuevo",
}


def test_lo_busca_primero_por_place_id():
    db = SupabaseFalso(por_place_id=[{"id": "abc", "estado": "contactado"}])
    r = asyncio.run(insertar_o_actualizar(db, LEAD))
    assert db.busquedas[0] == "google_place_id"
    assert r == "actualizado"
    assert not db.insertados, "no se inserta algo que ya esta"


def test_el_mismo_negocio_con_el_nombre_cambiado_se_actualiza():
    # En la base esta como 'SDS Clinicas Dentales💎🇨🇱'; llega sin los emojis.
    # Por nombre no aparece; por place_id si.
    db = SupabaseFalso(por_place_id=[{"id": "abc", "estado": "sin_contactar"}],
                       por_nombre=[])
    assert asyncio.run(insertar_o_actualizar(db, LEAD)) == "actualizado"
    assert db.actualizados, "su ficha tiene que refrescarse"


def test_si_no_esta_por_ningun_lado_se_inserta():
    db = SupabaseFalso()
    assert asyncio.run(insertar_o_actualizar(db, LEAD)) == "nuevo"
    assert len(db.insertados) == 1


def test_sin_place_id_se_cae_al_nombre():
    db = SupabaseFalso(por_nombre=[{"id": "abc", "estado": "nuevo"}])
    sin = {k: v for k, v in LEAD.items() if k != "google_place_id"}
    assert asyncio.run(insertar_o_actualizar(db, sin)) == "actualizado"
    assert db.busquedas == ["nombre_negocio"]
