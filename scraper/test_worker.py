# -*- coding: utf-8 -*-
"""Pruebas del worker que corre lo que el equipo pide desde el CRM.

Se prueban las dos piezas que pueden fallar en silencio:

1. `armar_comando`, porque de ahi sale una LINEA DE COMANDOS a partir de algo
   que escribio una persona en un navegador.
2. Las expresiones que leen el log, porque si no matchean nadie se entera --
   la corrida funciona igual y la pantalla se queda en cero, que es peor que
   un error visible.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import worker  # noqa: E402


# --- lo que sale hacia la linea de comandos --------------------------------

def test_sin_filtros_corre_como_siempre():
    cmd = worker.armar_comando({})
    assert "--concurrencia" in cmd and "1" in cmd
    assert "--nicho" not in cmd


def test_filtros_conocidos_se_traducen():
    cmd = worker.armar_comando({"nicho": "barberías", "comuna": "Ñuñoa", "cantidad": 40})
    assert cmd[cmd.index("--nicho") + 1] == "barberías"
    assert cmd[cmd.index("--comuna") + 1] == "Ñuñoa"
    assert cmd[cmd.index("--cantidad") + 1] == "40"


def test_lo_desconocido_no_llega_al_comando():
    """Lista blanca: lo que viene de la tabla lo escribio alguien en un navegador."""
    cmd = worker.armar_comando({"nicho": "gimnasios", "--upload-file": "/etc/passwd",
                                "rm": "-rf", "concurrencia": 8})
    assert "--upload-file" not in cmd
    assert "/etc/passwd" not in cmd
    assert "-rf" not in cmd
    # y la concurrencia sigue siendo la nuestra, no la que pidieron
    assert cmd.count("--concurrencia") == 1
    assert cmd[cmd.index("--concurrencia") + 1] == "1"


def test_vacios_no_ensucian_el_comando():
    cmd = worker.armar_comando({"nicho": "", "comuna": None, "cantidad": 0})
    assert "--nicho" not in cmd and "--comuna" not in cmd


# --- leer el log del scraper ------------------------------------------------
# Las lineas son COPIADAS del scraper (scraper.py:434 y :555), no inventadas.

INICIO = "2026-08-09 07:00:01 INFO [barberías] Iniciando busqueda..."
FIN = ("2026-08-09 07:04:12 INFO [barberías] Completado — 5 nuevos, "
       "2 actualizados, 1 descartados, 3 ya-conocidos-salteados")


def test_detecta_que_rubro_esta_haciendo():
    m = worker.RE_INICIA.search(INICIO)
    assert m and m.group("cat") == "barberías"


def test_detecta_que_termino_un_rubro():
    assert worker.RE_COMPLETA.search(FIN)


def test_cuenta_los_nuevos_de_verdad():
    """El scraper escribe '5 nuevos', con el numero ANTES de la palabra."""
    m = worker.RE_NUEVOS.search(FIN)
    assert m and m.group("n") == "5"


def test_no_confunde_nuevos_con_las_otras_cifras():
    m = worker.RE_NUEVOS.search(FIN)
    assert m.group("n") not in ("2", "1", "3")


def test_una_linea_cualquiera_no_dispara_nada():
    otra = "2026-08-09 07:00:00 INFO Abriendo navegador"
    assert not worker.RE_INICIA.search(otra)
    assert not worker.RE_COMPLETA.search(otra)


# --- de donde saca las llaves ----------------------------------------------
# El mismo dato se llama distinto en la app (nombres de Next) y en el .env del
# servidor. Escrito con un solo nombre, el worker arranca y muere al instante
# en un servidor donde todo lo demas anda.

import pytest  # noqa: E402


def _limpiar(monkeypatch):
    for n in worker.NOMBRES_URL + worker.NOMBRES_KEY:
        monkeypatch.delenv(n, raising=False)


def test_toma_los_nombres_de_next(monkeypatch):
    _limpiar(monkeypatch)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "llave-next")
    assert worker._primera(worker.NOMBRES_URL) == "https://x.supabase.co"
    assert worker._primera(worker.NOMBRES_KEY) == "llave-next"


def test_toma_los_nombres_del_servidor(monkeypatch):
    """Los que ya usa scraper.py en /opt/scraper/.env desde julio."""
    _limpiar(monkeypatch)
    monkeypatch.setenv("SUPABASE_URL", "https://y.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "llave-servidor")
    assert worker._primera(worker.NOMBRES_URL) == "https://y.supabase.co"
    assert worker._primera(worker.NOMBRES_KEY) == "llave-servidor"


def test_si_estan_los_dos_gana_el_de_next(monkeypatch):
    _limpiar(monkeypatch)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://next.supabase.co")
    monkeypatch.setenv("SUPABASE_URL", "https://viejo.supabase.co")
    assert worker._primera(worker.NOMBRES_URL) == "https://next.supabase.co"


def test_una_variable_vacia_no_cuenta(monkeypatch):
    """Una linea 'SUPABASE_URL=' en el .env no es una configuracion valida."""
    _limpiar(monkeypatch)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_URL", "https://bueno.supabase.co")
    assert worker._primera(worker.NOMBRES_URL) == "https://bueno.supabase.co"


def test_sin_nada_el_error_dice_que_falta_y_donde(monkeypatch):
    _limpiar(monkeypatch)
    with pytest.raises(SystemExit) as e:
        worker.conectar()
    msg = str(e.value)
    assert "/opt/scraper/.env" in msg
    assert "SUPABASE_URL" in msg and "SUPABASE_SERVICE_KEY" in msg
