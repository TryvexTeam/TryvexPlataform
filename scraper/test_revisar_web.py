"""Que las senales digan la verdad: sin inventar capacidades y sin callarlas.

El sesgo elegido y por que: preferimos NO detectar una agenda real antes que
afirmar una que no existe. Un falso positivo hace que le callemos justo lo que
ese negocio necesita; un falso negativo solo nos deja donde estabamos.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from revisar_web import senales_en  # noqa: E402


# --- lo que SI tiene que encontrar -------------------------------------------

def test_reconoce_proveedores_de_agenda_chilenos():
    assert "reserva" in senales_en('<a href="https://www.reservo.cl/abc">Reservar</a>')
    assert "reserva" in senales_en('<a href="https://agendapro.com/x">Agenda</a>')


def test_reconoce_boton_book_now():
    # Caso real: fycsalon.com tiene <div data-testid="book-now">book now</div>.
    assert "reserva" in senales_en('<div data-testid="book-now"><span>Book Now</span></div>')


def test_reconoce_reservar_hora_escrito_en_espanol():
    assert "reserva" in senales_en("<button>Reserva tu hora</button>")
    assert "reserva" in senales_en("<a>Agendar cita</a>")
    assert "reserva" in senales_en("<a>Pedir hora</a>")


def test_reconoce_carrito_y_medios_de_pago_chilenos():
    assert "carrito" in senales_en('<script src="/woocommerce.js">')
    assert "carrito" in senales_en('<form action="https://webpay.transbank.cl/pago">')
    assert "carrito" in senales_en('<a href="https://bsale.cl/tienda">')


def test_reconoce_whatsapp_y_formulario():
    assert "whatsapp" in senales_en('<a href="https://wa.me/56912345678">Escríbenos</a>')
    assert "formulario" in senales_en('<form action="/enviar"><input name="mail"></form>')


# --- lo que NO tiene que confundir -------------------------------------------

def test_la_palabra_agenda_sola_no_es_una_agenda_de_horas():
    # "agenda de actividades" o "nuestra agenda cultural" no permiten pedir hora.
    html = "<h2>Agenda de actividades</h2><p>Mira nuestra agenda cultural del mes</p>"
    assert "reserva" not in senales_en(html)


def test_un_sitio_vitrina_no_reporta_capacidades():
    html = "<html><body><h1>Optica Premium</h1><p>Visitanos en Santiago</p></body></html>"
    assert senales_en(html) == set()


def test_no_confunde_telefono_con_whatsapp():
    # Tener el numero escrito no es tener WhatsApp enlazado: no se puede
    # afirmar que el cliente pueda escribirle con un clic.
    assert "whatsapp" not in senales_en("<p>Llámanos al +56 9 1234 5678</p>")


def test_las_mayusculas_no_esconden_una_senal():
    assert "reserva" in senales_en("<A HREF='HTTPS://RESERVO.CL/X'>RESERVAR</A>")


# --- en que ESTADO esta el sitio -------------------------------------------
# Un dominio que responde 200 no es un negocio con web andando. Y el que la
# tiene a medias es el MEJOR lead: ya decidio que la necesita, ya puso plata y
# quedo botado. Casos del diagnostico del 15-sep.

from revisar_web import clasificar_sitio, RevisionWeb  # noqa: E402


def test_en_mantencion_no_es_un_sitio_andando():
    # Santo Pan: su dominio responde 200 y dice esto.
    assert clasificar_sitio("<html><body><h1>Sitio en mantención</h1><p>Volvemos pronto</p></body></html>") == "en_obra"
    assert clasificar_sitio("<h1>Under Construction</h1>") == "en_obra"
    assert clasificar_sitio("<h1>Coming soon</h1>") == "en_obra"


def test_staging_se_detecta_por_el_dominio():
    # La Tienda de Ruben: su tienda vive en wpcomstaging.com.
    assert clasificar_sitio("<html>" + "palabra " * 100 + "</html>",
                            "https://latiendaderuben.wpcomstaging.com/") == "staging"


def test_dominio_en_venta_no_es_del_negocio():
    assert clasificar_sitio("<h1>This domain is for sale</h1>") == "parqueada"
    assert clasificar_sitio("<p>Dominio en venta, contacte al broker</p>") == "parqueada"


def test_una_pagina_casi_vacia_no_es_un_sitio():
    assert clasificar_sitio("<html><body><p>Hola</p></body></html>") == "vacia"


def test_un_sitio_de_verdad_se_reconoce_como_vivo():
    html = "<html><body>" + "<p>Lentes oftalmicos y examen de la vista en Santiago</p>" * 20 + "</body></html>"
    assert clasificar_sitio(html, "https://optica.cl/") == "viva"


def test_el_sitio_a_medias_es_oportunidad_y_el_vivo_no():
    for estado in ("en_obra", "staging", "parqueada", "vacia"):
        assert RevisionWeb(url="x", estado=estado).es_oportunidad, estado
    # "caida" pide haberlo comprobado: ver los tests del timeout mas abajo.
    assert RevisionWeb(url="x", estado="caida", revisada=True).es_oportunidad
    assert not RevisionWeb(url="x", estado="viva").es_oportunidad
    assert not RevisionWeb(url="x", estado="desconocido").es_oportunidad


def test_el_dominio_parqueado_que_rebota_a_lander():
    # Caso real (cafeforestal.com, 15-sep): 114 bytes de HTML, responde 200, y
    # rebota por JavaScript a /lander. El scraper lo contaba como "tiene web".
    html = '<!DOCTYPE html><html><head><script>window.onload=function(){window.location.href="/lander"}</script></head></html>'
    assert clasificar_sitio(html) == "parqueada"


# ── Un timeout NO es un sitio caido ──────────────────────────────────────────
# Caso real del 16-sep, primera corrida con esto en el VPS:
# pasteleriavienesa.cl quedo marcada "caida" por ConnectTimeout desde el
# servidor, y responde 200 desde otra red. El sitio bloquea al datacenter.
# Sin este freno, Vex le escribe al dueño diciendole que su web esta caida.


def test_un_timeout_no_cuenta_como_oportunidad():
    r = RevisionWeb(url="https://www.pasteleriavienesa.cl/")
    r.estado = "caida"
    r.revisada = False
    r.error = "ConnectTimeout"
    assert not r.es_oportunidad, "un timeout es 'no pudimos ver', no 'esta caida'"


def test_una_caida_comprobada_por_http_si_cuenta():
    # Un 404 o un 500 lo contesto el servidor: eso si lo vimos.
    r = RevisionWeb(url="https://ejemplo.cl")
    r.estado = "caida"
    r.revisada = True
    r.error = "home respondio 404"
    assert r.es_oportunidad


def test_los_otros_estados_no_dependen_de_revisada():
    for estado in ("en_obra", "staging", "parqueada", "vacia"):
        r = RevisionWeb(url="https://ejemplo.cl")
        r.estado = estado
        r.revisada = True
        assert r.es_oportunidad, estado


def test_una_web_viva_nunca_es_oportunidad():
    r = RevisionWeb(url="https://ejemplo.cl")
    r.estado = "viva"
    r.revisada = True
    assert not r.es_oportunidad


# ── Un 403 no es una web rota, es una web que nos bloquea ────────────────────
# Caso real del 16-sep, la corrida de prueba antes de encender el timer:
# floristeriayregalos.cl dio 403 al bot desde el VPS y responde 200 desde otra
# red. Quedo guardada como "caida" con score 9.


def test_un_bloqueo_no_es_oportunidad():
    for codigo in (401, 403, 429, 451):
        r = RevisionWeb(url="x", estado="bloqueada", error=f"home respondio {codigo}")
        assert not r.es_oportunidad, codigo
        assert not r.revisada, "un bloqueo no es haber visto el sitio"


def test_los_codigos_de_bloqueo_estan_declarados():
    from revisar_web import BLOQUEO

    assert 403 in BLOQUEO and 429 in BLOQUEO
    # Un 404 y un 500 SI hablan del sitio: esos no van aca.
    assert 404 not in BLOQUEO and 500 not in BLOQUEO


def _respuesta_falsa(codigo: int, cuerpo: str = ""):
    """Un servidor de mentira que siempre contesta lo mismo, sin salir a la red."""
    import asyncio

    import httpx

    import revisar_web as rw

    def handler(request):
        return httpx.Response(codigo, text=cuerpo)

    original = rw.httpx.AsyncClient

    class ClienteFalso(original):
        def __init__(self, **kw):
            kw["transport"] = httpx.MockTransport(handler)
            super().__init__(**kw)

    rw.httpx.AsyncClient = ClienteFalso
    try:
        return asyncio.run(rw.revisar_web("https://ejemplo.cl"))
    finally:
        rw.httpx.AsyncClient = original


def test_un_403_de_verdad_queda_como_bloqueada():
    r = _respuesta_falsa(403)
    assert r.estado == "bloqueada"
    assert not r.es_oportunidad, "un 403 nos bloquea a nosotros; su sitio puede estar sano"


def test_un_404_de_verdad_si_queda_como_caida():
    r = _respuesta_falsa(404)
    assert r.estado == "caida"
    assert r.es_oportunidad


# ── Un frameset no es una web vacia, es una web vieja ────────────────────────
# Caso real del 16-sep, cuarta corrida de prueba: ferreteriasantodomingo.cl
# son 646 bytes de <frameset> apuntando a smartienda.cl. Contado por palabras
# da "vacia", y adentro del marco hay una tienda con 115 palabras. Entro como
# lead con score 85 por un vacio que no existia.

FRAMESET = """<!DOCTYPE html><html><head><title>ferreteria</title></head>
<frameset rows="*,0">
<frame src="https://www.smartienda.cl/smartienda2004/finalizar.asp?php=4493" id="mainFrame" />
<frame src="" name="bottomFrame" />
</frameset></html>"""


def test_encuentra_el_marco_principal():
    from revisar_web import marco_principal

    assert marco_principal(FRAMESET).startswith("https://www.smartienda.cl/")


def test_una_pagina_normal_no_tiene_marco():
    from revisar_web import marco_principal

    assert marco_principal("<html><body><p>hola</p></body></html>") == ""
    assert marco_principal("") == ""


def test_el_frameset_solo_no_alcanza_para_decir_vacia():
    # La cascara sola SI parece vacia: por eso hay que seguir el marco.
    assert clasificar_sitio(FRAMESET, "https://ferreteria.cl") == "vacia"
