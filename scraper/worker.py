# -*- coding: utf-8 -*-
"""
El que vacia el buzon: mira `scraper_runs` y corre lo que el equipo pidio.

Por que existe
--------------
El scraper abre un Chromium de verdad, asi que no puede vivir en Vercel. La app
y el scraper quedan en dos maquinas distintas y hay que comunicarlas.

Lo obvio seria que la app le pegue por HTTP a este servidor. No se hizo, a
proposito: eso obliga a exponer un puerto o a colgarse de un tunel de
Cloudflare, y esos cambian de direccion cada vez que reinician (nos mordio dos
veces la semana del 8-ago-2026). Cada reinicio romperia el boton.

Asi que la app no llama a nadie: deja escrito el pedido, y este proceso lo lee.
Consecuencias buenas: no hay puerto abierto, el servidor no necesita ser
alcanzable desde afuera, y si esta apagado cuando alguien aprieta el boton, la
corrida no se pierde -- queda encolada y arranca cuando vuelve.

Como se instala
---------------
    sudo cp scraper/tryvex-scraper-worker.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now tryvex-scraper-worker

Necesita en /opt/scraper/.env la URL de Supabase y la clave de servicio. Se
aceptan los dos juegos de nombres que conviven en el proyecto: los de Next
(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) y los cortos que ya usa
scraper.py en el servidor (SUPABASE_URL / SUPABASE_SERVICE_KEY).
"""
import logging
import os
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

CADA_SEG = int(os.getenv("WORKER_INTERVALO", "15"))
AQUI = os.path.dirname(os.path.abspath(__file__))
STOP_FILE = os.path.join(AQUI, ".stop")

# Filtros que se aceptan del buzon, y como se traducen a la linea de comandos.
# Es una lista blanca a proposito: lo que viene de la tabla lo escribio alguien
# desde un navegador, y de aca sale un comando. Nada que no este en este mapa
# llega nunca a la linea de comandos.
FLAGS = {
    "nicho": "--nicho",
    "comuna": "--comuna",
    "ciudad": "--ciudad",
    "region": "--region",
    "pais": "--pais",
    "zoom": "--zoom",
    "cantidad": "--cantidad",
}

# Lo que el scraper ya escribe en su log, para poder contar como va sin tocarlo.
# Ojo con el orden: el scraper escribe "5 nuevos", con el numero ANTES de la
# palabra ("[barberias] Completado - 5 nuevos, 2 actualizados, ..."). Buscar
# "nuevos: 5" no matchea nunca y el contador se queda en cero para siempre.
RE_INICIA = re.compile(r"\[(?P<cat>[^\]]+)\] Iniciando busqueda")
RE_COMPLETA = re.compile(r"\[(?P<cat>[^\]]+)\] Completado")
RE_NUEVOS = re.compile(r"(?P<n>\d+)\s+nuevos\b", re.I)

log = logging.getLogger("worker")


def ahora():
    return datetime.now(timezone.utc).isoformat()


# El mismo dato se llama distinto en cada lado: la app de Vercel usa los
# nombres de Next, y el .env del servidor (el que ya usa scraper.py desde
# julio) usa los cortos. Se aceptan los dos y gana el que exista.
#
# No es capricho: escrito con UN solo nombre, este worker arranca y se cae al
# instante con un KeyError en un servidor donde todo lo demas funciona --
# y el mensaje no dice "te falta una variable", dice el nombre que ÉL espera,
# que es justamente el que ahi no se usa.
NOMBRES_URL = ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
NOMBRES_KEY = ("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY")


def _primera(nombres):
    """El primer valor no vacio de la lista de nombres, o None."""
    for n in nombres:
        v = os.environ.get(n)
        if v:
            return v
    return None


def conectar():
    # Se revisa la configuracion ANTES de importar el cliente: si falta una
    # variable, el mensaje tiene que hablar de la variable que falta y no de
    # una libreria. Un error que apunta al lugar equivocado cuesta mas que no
    # tener error.
    url = _primera(NOMBRES_URL)
    key = _primera(NOMBRES_KEY)
    if not url or not key:
        faltan = []
        if not url:
            faltan.append(" o ".join(NOMBRES_URL))
        if not key:
            faltan.append(" o ".join(NOMBRES_KEY))
        # Que el error diga QUE falta y DONDE ponerlo, no solo un nombre suelto.
        raise SystemExit(
            "Falta en /opt/scraper/.env: " + "; ".join(faltan)
        )

    # El import va acá adentro y no arriba a proposito: asi armar_comando() y
    # las expresiones que leen el log se pueden probar sin tener instalado el
    # cliente de Supabase. Lo que puede fallar en silencio conviene que sea lo
    # mas barato de probar.
    from supabase import create_client

    return create_client(url, key)


def armar_comando(filtros):
    """Traduce los filtros del buzon a argumentos, ignorando lo que no conozco."""
    cmd = [sys.executable, os.path.join(AQUI, "scraper.py"), "--concurrencia", "1"]
    for clave, flag in FLAGS.items():
        valor = (filtros or {}).get(clave)
        if valor in (None, "", []):
            continue
        cmd += [flag, str(valor)]
    return cmd


def tomar_una(sb):
    """La corrida encolada mas vieja, marcada como mia.

    El `.eq("estado", "encolada")` en el UPDATE no es decorativo: si dos workers
    llegaran a correr a la vez (por ejemplo durante un deploy), el segundo ve 0
    filas afectadas y no toca nada.
    """
    pend = (sb.table("scraper_runs").select("*")
            .eq("estado", "encolada").order("fecha").limit(1).execute())
    if not pend.data:
        return None

    fila = pend.data[0]
    tomada = (sb.table("scraper_runs")
              .update({"estado": "corriendo", "iniciada_at": ahora()})
              .eq("id", fila["id"]).eq("estado", "encolada").execute())
    return fila if tomada.data else None


def vigilar_freno(sb, corrida_id, proceso, fin):
    """Si alguien pide freno desde la app, se lo avisa al scraper.

    El scraper corta ENTRE categorias, no en medio de una, para no dejar leads a
    medio escribir. Por eso esto deja una senal y no mata el proceso.
    """
    while not fin.is_set():
        try:
            r = (sb.table("scraper_runs").select("freno_pedido")
                 .eq("id", corrida_id).single().execute())
            if r.data and r.data.get("freno_pedido"):
                open(STOP_FILE, "w").close()
                log.info("freno pedido -> senal dejada, corta al terminar el rubro")
                return
        except Exception as e:
            log.warning("no pude revisar el freno: %s", e)
        fin.wait(5)


def correr(sb, corrida):
    """Corre el scraper y va contando como va."""
    cid = corrida["id"]
    cmd = armar_comando(corrida.get("filtros"))
    log.info("corrida %s -> %s", cid[:8], " ".join(cmd[2:]))

    if os.path.exists(STOP_FILE):
        os.remove(STOP_FILE)

    fin = threading.Event()
    proc = subprocess.Popen(cmd, cwd=AQUI, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True,
                            encoding="utf-8", errors="replace", bufsize=1)

    hilo = threading.Thread(target=vigilar_freno, args=(sb, cid, proc, fin), daemon=True)
    hilo.start()

    hechas, nuevos, ultima_escritura = 0, 0, 0.0
    try:
        for linea in proc.stdout:
            linea = linea.rstrip()
            cambio = {}

            m = RE_INICIA.search(linea)
            if m:
                cambio["categoria_actual"] = m.group("cat")

            if RE_COMPLETA.search(linea):
                hechas += 1
                cambio["categorias_hechas"] = hechas
                m2 = RE_NUEVOS.search(linea)
                if m2:
                    nuevos += int(m2.group("n"))
                    cambio["nuevos_leads"] = nuevos

            # Como mucho una escritura por segundo: el progreso es para que se
            # vea movimiento, no para llevar la contabilidad fina.
            if cambio and (time.time() - ultima_escritura) > 1.0:
                ultima_escritura = time.time()
                try:
                    sb.table("scraper_runs").update(cambio).eq("id", cid).execute()
                except Exception as e:
                    log.warning("no pude anotar el avance: %s", e)

        codigo = proc.wait()
    finally:
        fin.set()

    freno = os.path.exists(STOP_FILE)
    if freno:
        os.remove(STOP_FILE)

    estado = "frenada" if freno else ("lista" if codigo == 0 else "fallida")
    cierre = {
        "estado": estado,
        "terminada_at": ahora(),
        "categorias_hechas": hechas,
        "nuevos_leads": nuevos,
        "categoria_actual": None,
    }
    if estado == "fallida":
        cierre["error"] = "el scraper termino con codigo %s" % codigo

    sb.table("scraper_runs").update(cierre).eq("id", cid).execute()
    log.info("corrida %s -> %s (%s rubros, %s nuevos)", cid[:8], estado, hechas, nuevos)


def main():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    sb = conectar()
    log.info("worker despierto, mirando el buzon cada %ss", CADA_SEG)

    while True:
        try:
            corrida = tomar_una(sb)
            if corrida:
                correr(sb, corrida)
                continue           # por si quedo otra encolada, sin esperar
        except Exception as e:
            log.exception("vuelta fallida: %s", e)
        time.sleep(CADA_SEG)


if __name__ == "__main__":
    main()
