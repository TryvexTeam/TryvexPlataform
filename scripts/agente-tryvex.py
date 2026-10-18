# -*- coding: utf-8 -*-
"""Cliente de Tryvex para agentes: el canal del equipo y el trabajo de Intelligence.

Es el mismo cliente con el que los agentes ya hablan en el canal "Equipo
agéntico" (el antiguo #chatia), extendido para trabajar: leer los encargos que
el equipo les aprobó, tomarlos, responderlos, y reportar lo que hacen. Cualquier
IA con un token de agente puede usarlo sin conocer la API: `manual` le explica
todo.

    python agente-tryvex.py manual                     # quién soy y qué puedo hacer
    python agente-tryvex.py nuevos [--peek]            # canal: lo no visto
    python agente-tryvex.py enviar --file X.txt        # canal: publicar

    python agente-tryvex.py encargos [--todos]         # mi trabajo aprobado
    python agente-tryvex.py tomar ID
    python agente-tryvex.py responder ID --file X.txt
    python agente-tryvex.py directivas [--para primer_mensaje]
    python agente-tryvex.py consumo --modelo M --entrada N --salida N --usd X [--encargo ID]
    python agente-tryvex.py rutina --nombre N --tipo reloj --disparador "..." [--resultado ok --detalle "..."]
    python agente-tryvex.py mejora --titulo T --evidencia-file E.txt [--detalle-file D.txt]
    python agente-tryvex.py documentos
    python agente-tryvex.py citar DOC_ID [--encargo ID]

Para ver la respuesta completa en JSON: --json ANTES del comando (agente-tryvex.py --json encargos).

Los textos largos (respuestas, mensajes, evidencia) van SIEMPRE por archivo:
pasarlos por argv en Windows pierde los acentos, y en bash los backticks del
markdown se ejecutarían.

Configuración (variables de entorno, todas opcionales):
    TRYVEX_CRM_URL      por defecto https://tryvexplataform.vercel.app
    TRYVEX_AGENTE_TOKEN el token; si falta, se lee de TRYVEX_TOKEN_FILE
    TRYVEX_TOKEN_FILE   por defecto ~/.claude/.tryvex-agente-token
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

# En Windows la consola usa cp1252 y un emoji o una tilde tumban el print.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

CASA = os.path.expanduser("~/.claude")
BASE = os.environ.get("TRYVEX_CRM_URL", "https://tryvexplataform.vercel.app").rstrip("/")
TOKEN_FILE = os.environ.get("TRYVEX_TOKEN_FILE", os.path.join(CASA, ".tryvex-agente-token"))
MARCA_FILE = os.path.join(CASA, ".tryvex-canal-visto.json")
IDENTIDAD_FILE = os.path.join(CASA, ".tryvex-agente-identidad.json")
HILO = "Equipo agéntico"


class ErrorApi(Exception):
    pass


def token():
    t = os.environ.get("TRYVEX_AGENTE_TOKEN", "").strip()
    if t:
        return t
    with open(TOKEN_FILE, encoding="utf-8") as f:
        return f.readline().strip()


def pedir(ruta, metodo="GET", cuerpo=None):
    """Llama a la API. Un error nunca se traga: se levanta con el motivo que dio el CRM."""
    datos = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo)
    req.add_header("Authorization", "Bearer " + token())
    if datos is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            motivo = json.loads(e.read().decode("utf-8")).get("error", "")
        except (ValueError, AttributeError):
            motivo = ""
        raise ErrorApi("HTTP %d: %s" % (e.code, motivo or e.reason))


def leer_archivo(ruta):
    with open(ruta, encoding="utf-8") as f:
        texto = f.read().strip()
    if not texto:
        raise ErrorApi("el archivo %s está vacío" % ruta)
    return texto


def mostrar(d, args):
    if getattr(args, "json", False):
        print(json.dumps(d, ensure_ascii=False, indent=2))
        return True
    return False


# ─── identidad ───────────────────────────────────────────────────────────

def yo():
    """Mi id de agente. Se pregunta al CRM una vez y se guarda: sirve para no
    tomar mis propios mensajes del canal como novedades (y responderme en bucle)."""
    try:
        with open(IDENTIDAD_FILE, encoding="utf-8") as f:
            guardado = json.load(f)
        if guardado.get("base") == BASE and guardado.get("id"):
            return guardado["id"]
    except (OSError, ValueError):
        pass
    try:
        agente = pedir("/api/agentes/manual").get("agente", {})
    except ErrorApi:
        return os.environ.get("TRYVEX_AGENTE_ID")
    with open(IDENTIDAD_FILE, "w", encoding="utf-8") as f:
        json.dump({"base": BASE, "id": agente.get("id"), "nombre": agente.get("nombre")}, f)
    return agente.get("id")


# ─── canal del equipo (compatible con canal-tryvex.py) ───────────────────

def vistos():
    try:
        with open(MARCA_FILE, encoding="utf-8") as f:
            return set(json.load(f).get("ids", []))
    except (OSError, ValueError):
        return set()


def marcar(ids):
    # Los últimos 200 y no todos: la marca no es un archivo histórico.
    with open(MARCA_FILE, "w", encoding="utf-8") as f:
        json.dump({"ids": list(ids)[-200:]}, f)


def cmd_nuevos(args):
    todos = pedir("/api/agentes/mensajes?limite=50").get("data", [])
    ya = vistos()
    propio = yo()
    nuevos = [m for m in todos if m["id"] not in ya and m.get("agente_id") != propio]
    if not nuevos:
        print("SIN NOVEDADES")
        return 0
    print("NOVEDADES: %d" % len(nuevos))
    for m in nuevos:
        print("--- %s | agente %s ---" % (m["created_at"], m.get("agente_id")))
        print(m["contenido"])
    if not args.peek:
        marcar(ya | {m["id"] for m in todos})
    return 0


def cmd_enviar(args):
    contenido = leer_archivo(args.file)
    d = pedir("/api/agentes/mensajes", "POST", {"contenido": contenido, "hilo": HILO})
    if not d.get("success"):
        raise ErrorApi(str(d))
    # Si estoy contestando, ya leí lo de arriba: se marca todo, no solo lo mío.
    previos = {m["id"] for m in pedir("/api/agentes/mensajes?limite=50").get("data", [])}
    marcar(vistos() | previos | {d["data"]["id"]})
    print("ENVIADO", d["data"]["id"])
    return 0


# ─── Intelligence ────────────────────────────────────────────────────────

def cmd_manual(args):
    d = pedir("/api/agentes/manual")
    if mostrar(d, args):
        return 0
    a = d.get("agente", {})
    print("Soy %s (%s) en %s\n" % (a.get("nombre"), a.get("id"), d.get("base")))
    print("REGLAS")
    for r in d.get("reglas", []):
        print(" -", r)
    print("\nCICLO RECOMENDADO")
    for c in d.get("ciclo", []):
        print(" ", c)
    print("\nRUTAS")
    for r in d.get("rutas", []):
        print(" %-5s %-26s %s" % (r["metodo"], r["ruta"], r["para"]))
        for regla in r.get("reglas", []):
            print("        · " + regla)
    return 0


def cmd_encargos(args):
    d = pedir("/api/agentes/encargos" + ("?todos=1" if args.todos else ""))
    if mostrar(d, args):
        return 0
    encargos = d.get("encargos", [])
    if not encargos:
        print("SIN ENCARGOS")
        return 0
    print("ENCARGOS: %d" % len(encargos))
    for e in encargos:
        marca = "  (ESPERA PERMISO: no se ejecuta)" if e["estado"] == "encolado" else ""
        print("--- %s | %s | %s | prioridad %s%s ---" % (e["id"], e["tipo"], e["estado"], e["prioridad"], marca))
        print(e["titulo"])
        if e.get("detalle"):
            print(e["detalle"])
    if d.get("nota"):
        print("\nNOTA:", d["nota"])
    return 0


def cmd_tomar(args):
    d = pedir("/api/agentes/encargos", "PATCH", {"accion": "tomar", "id": args.id})
    if not mostrar(d, args):
        print("TOMADO", d["encargo"]["id"], "→", d["encargo"]["estado"])
    return 0


def cmd_responder(args):
    respuesta = leer_archivo(args.file)
    d = pedir("/api/agentes/encargos", "PATCH", {"accion": "responder", "id": args.id, "respuesta": respuesta})
    if not mostrar(d, args):
        print("RESPONDIDO", d["encargo"]["id"])
    return 0


def cmd_directivas(args):
    d = pedir("/api/agentes/directivas?para=" + args.para)
    if mostrar(d, args):
        return 0
    if not d.get("directivas"):
        print("SIN DIRECTIVAS VIGENTES")
        return 0
    print("DIRECTIVAS VIGENTES (%s):" % d.get("para"))
    for t in d["directivas"]:
        print(" -", t)
    return 0


def cmd_consumo(args):
    cuerpo = {"modelo": args.modelo, "tokensEntrada": args.entrada, "tokensSalida": args.salida, "costoUsd": args.usd}
    if args.encargo:
        cuerpo["encargoId"] = args.encargo
    d = pedir("/api/agentes/consumo", "POST", cuerpo)
    if not mostrar(d, args):
        print("CONSUMO REGISTRADO")
    return 0


def cmd_rutina(args):
    cuerpo = {"nombre": args.nombre, "tipo": args.tipo, "disparador": args.disparador}
    if args.resultado:
        cuerpo["resultado"] = args.resultado
    if args.detalle:
        cuerpo["detalle"] = args.detalle
    if args.proxima:
        cuerpo["proximaAt"] = args.proxima
    d = pedir("/api/agentes/rutinas", "PUT", cuerpo)
    if mostrar(d, args):
        return 0
    if d.get("activa") is False:
        # Esto se imprime y se sale con código 3 para que un script lo note sin parsear.
        print("RUTINA APAGADA POR EL EQUIPO: no correrla")
        return 3
    print("RUTINA REGISTRADA")
    return 0


def cmd_mejora(args):
    cuerpo = {"titulo": args.titulo, "evidencia": leer_archivo(args.evidencia_file)}
    if args.detalle_file:
        cuerpo["detalle"] = leer_archivo(args.detalle_file)
    d = pedir("/api/agentes/mejoras", "POST", cuerpo)
    if not mostrar(d, args):
        print("MEJORA PROPUESTA", d.get("id"), "(una persona la aprueba antes de aplicarla)")
    return 0


def cmd_documentos(args):
    d = pedir("/api/agentes/citas")
    if mostrar(d, args):
        return 0
    docs = d.get("documentos", [])
    if not docs:
        print("EL CEREBRO NO TIENE DOCUMENTOS TODAVÍA")
        return 0
    for doc in docs:
        print("--- %s | %s | %s ---" % (doc["id"], doc.get("categoria") or "sin categoría", doc["titulo"]))
    return 0


def cmd_citar(args):
    cuerpo = {"documentoId": args.documento}
    if args.encargo:
        cuerpo["encargoId"] = args.encargo
    d = pedir("/api/agentes/citas", "POST", cuerpo)
    if not mostrar(d, args):
        print("CITA REGISTRADA")
    return 0


def main():
    p = argparse.ArgumentParser(description="Cliente de Tryvex para agentes.")
    p.add_argument("--json", action="store_true", help="mostrar la respuesta completa en JSON")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("manual", help="quién soy y qué puedo hacer").set_defaults(func=cmd_manual)

    n = sub.add_parser("nuevos", help="canal: lo no visto")
    n.add_argument("--peek", action="store_true", help="no marcar como visto")
    n.set_defaults(func=cmd_nuevos)

    e = sub.add_parser("enviar", help="canal: publicar el contenido de un archivo")
    e.add_argument("--file", required=True)
    e.set_defaults(func=cmd_enviar)

    en = sub.add_parser("encargos", help="mi trabajo aprobado")
    en.add_argument("--todos", action="store_true", help="incluir lo que espera permiso (solo lectura)")
    en.set_defaults(func=cmd_encargos)

    t = sub.add_parser("tomar", help="tomar un encargo aprobado")
    t.add_argument("id")
    t.set_defaults(func=cmd_tomar)

    r = sub.add_parser("responder", help="responder un encargo con el contenido de un archivo")
    r.add_argument("id")
    r.add_argument("--file", required=True)
    r.set_defaults(func=cmd_responder)

    di = sub.add_parser("directivas", help="decisiones vigentes del equipo")
    di.add_argument("--para", choices=["conversacion", "primer_mensaje"], default="conversacion")
    di.set_defaults(func=cmd_directivas)

    c = sub.add_parser("consumo", help="reportar gasto en modelos")
    c.add_argument("--modelo", required=True)
    c.add_argument("--entrada", type=int, required=True, help="tokens de entrada")
    c.add_argument("--salida", type=int, required=True, help="tokens de salida")
    c.add_argument("--usd", type=float, required=True, help="costo en dólares")
    c.add_argument("--encargo")
    c.set_defaults(func=cmd_consumo)

    ru = sub.add_parser("rutina", help="declarar una rutina y reportar su corrida")
    ru.add_argument("--nombre", required=True)
    ru.add_argument("--tipo", choices=["reloj", "evento"], required=True)
    ru.add_argument("--disparador", required=True)
    ru.add_argument("--resultado", choices=["ok", "falla"])
    ru.add_argument("--detalle")
    ru.add_argument("--proxima", help="próxima corrida, ISO 8601 con zona")
    ru.set_defaults(func=cmd_rutina)

    m = sub.add_parser("mejora", help="proponer una mejora con evidencia")
    m.add_argument("--titulo", required=True)
    m.add_argument("--evidencia-file", required=True)
    m.add_argument("--detalle-file")
    m.set_defaults(func=cmd_mejora)

    sub.add_parser("documentos", help="los documentos del Cerebro").set_defaults(func=cmd_documentos)

    ci = sub.add_parser("citar", help="dejar constancia de qué documento usé")
    ci.add_argument("documento")
    ci.add_argument("--encargo")
    ci.set_defaults(func=cmd_citar)

    args = p.parse_args()
    try:
        return args.func(args)
    except ErrorApi as e:
        # Nunca un fallo mudo: el motivo del CRM va a la salida y el código es 1.
        print("ERROR:", e, file=sys.stderr)
        return 1
    except OSError as e:
        print("ERROR: no se pudo leer/escribir un archivo o el token:", e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
