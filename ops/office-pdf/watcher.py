#!/usr/bin/env python3
"""
Conversor de Office a PDF para las vistas previas del chat del CRM.

POR QUÉ EXISTE
--------------
Word y Excel se veían mal en el chat: el visor online de Microsoft los muestra
como una foto que se arrastra (Word) o a baja resolución. Lo que se quiere es la
fidelidad de la app nativa —membrete, portada, formato— y con scroll. Eso lo da
un PDF: LibreOffice convierte docx/xlsx respetando el diseño, y el chat ya sabe
mostrar PDFs nítidos y con scroll.

CÓMO FUNCIONA (por qué acá y no en Vercel)
------------------------------------------
LibreOffice no corre en una función de Vercel. Este servicio vive en el VPS,
mira el bucket de adjuntos del CRM (Supabase), y por cada Office que todavía no
tiene su PDF: lo baja, lo convierte con LibreOffice y sube el PDF a
`_pdf/<id>.pdf` en el mismo bucket. El CRM después sirve ese PDF cacheado.

Así NO hay que exponer el VPS a internet ni acoplar Vercel con el VPS: el VPS
"jala" de Supabase con la service key y devuelve el PDF por el mismo lado.

PowerPoint NO se convierte acá: LibreOffice Impress deforma los pptx y encima se
cuelga en headless. Esos se quedan en el visor de Microsoft (lo decide el CRM).

Corre en bucle (systemd). Idempotente: si el PDF ya existe, no reconvierte.
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ENV_PATH = os.environ.get("SCRAPER_ENV", "/opt/scraper/.env")
BUCKET = "adjuntos-chat"
PREFIJO_PDF = "_pdf"          # dónde se guardan los PDF convertidos
INTERVALO = int(os.environ.get("OFFICE_PDF_INTERVALO", "30"))  # segundos
MAX_POR_VUELTA = int(os.environ.get("OFFICE_PDF_MAX", "5"))
TIMEOUT_CONV = int(os.environ.get("OFFICE_PDF_TIMEOUT", "120"))
# Solo lo que LibreOffice dibuja fiel. pptx/ppt/odp quedan fuera a propósito.
EXT_CONVERTIBLES = (".docx", ".doc", ".xlsx", ".xls", ".odt", ".ods", ".rtf")


def cargar_env(path):
    env = {}
    with open(path, "rb") as f:
        for raw in f.read().decode("utf-8", "replace").splitlines():
            raw = raw.strip().lstrip("﻿")
            if raw and not raw.startswith("#") and "=" in raw:
                k, v = raw.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = cargar_env(ENV_PATH)
SUPABASE_URL = ENV.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = (
    ENV.get("SUPABASE_SERVICE_ROLE_KEY")
    or ENV.get("SUPABASE_SERVICE_KEY")
    or ENV.get("SUPABASE_KEY")
)


def _req(url, data=None, method="GET", headers=None, timeout=60):
    h = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers


def listar_office():
    """Los adjuntos del chat que se pueden convertir a PDF."""
    url = (
        SUPABASE_URL
        + "/rest/v1/mensaje_adjuntos?select=id,ruta,nombre,tipo_mime,bytes"
    )
    body, _ = _req(url)
    filas = json.loads(body.decode())
    out = []
    for a in filas:
        nombre = (a.get("nombre") or "").lower()
        if nombre.endswith(EXT_CONVERTIBLES):
            out.append(a)
    return out


def pdfs_existentes():
    """Los `_pdf/<id>.pdf` que ya están subidos (para no reconvertir)."""
    url = SUPABASE_URL + "/storage/v1/object/list/" + BUCKET
    cuerpo = json.dumps(
        {"prefix": PREFIJO_PDF + "/", "limit": 1000}
    ).encode()
    body, _ = _req(
        url, data=cuerpo, method="POST",
        headers={"Content-Type": "application/json"},
    )
    ids = set()
    for obj in json.loads(body.decode()):
        n = obj.get("name", "")
        if n.endswith(".pdf"):
            ids.add(n[: -len(".pdf")])
    return ids


def descargar(ruta):
    url = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + urllib.parse.quote(ruta)
    body, _ = _req(url, timeout=120)
    return body


def subir_pdf(id_adjunto, contenido):
    ruta = f"{PREFIJO_PDF}/{id_adjunto}.pdf"
    url = SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + urllib.parse.quote(ruta)
    _req(
        url, data=contenido, method="POST",
        headers={"Content-Type": "application/pdf", "x-upsert": "true"},
        timeout=120,
    )


def convertir_a_pdf(nombre, datos):
    """LibreOffice: archivo -> PDF. Perfil aislado por conversión (evita locks)."""
    with tempfile.TemporaryDirectory(prefix="opdf_") as tmp:
        entrada = os.path.join(tmp, os.path.basename(nombre))
        with open(entrada, "wb") as f:
            f.write(datos)
        perfil = "file://" + os.path.join(tmp, "profile")
        r = subprocess.run(
            [
                "soffice",
                f"-env:UserInstallation={perfil}",
                "--headless", "--norestore", "--nologo",
                "--convert-to", "pdf", "--outdir", tmp, entrada,
            ],
            capture_output=True, text=True, timeout=TIMEOUT_CONV,
            env={**os.environ, "HOME": tmp},
        )
        base = os.path.splitext(os.path.basename(nombre))[0]
        pdf = os.path.join(tmp, base + ".pdf")
        if not os.path.exists(pdf):
            raise RuntimeError(f"no salió PDF: {r.stderr[:200] or r.stdout[:200]}")
        with open(pdf, "rb") as f:
            return f.read()


def una_vuelta():
    office = listar_office()
    ya = pdfs_existentes()
    pendientes = [a for a in office if a["id"] not in ya]
    if not pendientes:
        return 0
    hechos = 0
    for a in pendientes[:MAX_POR_VUELTA]:
        try:
            datos = descargar(a["ruta"])
            pdf = convertir_a_pdf(a["nombre"], datos)
            subir_pdf(a["id"], pdf)
            print(f"[office-pdf] {a['nombre']} -> {len(pdf)} bytes", flush=True)
            hechos += 1
        except Exception as e:
            # Un archivo que no convierte no puede frenar a los demás; se anota y
            # sigue. (Si fuera un pptx colado, quedaría reintentándose: por eso el
            # filtro de extensión de arriba lo deja fuera.)
            print(f"[office-pdf] FALLÓ {a.get('nombre')}: {e}", flush=True)
    return hechos


def main():
    if not (SUPABASE_URL and SERVICE_KEY):
        print("[office-pdf] falta SUPABASE_URL o service key en " + ENV_PATH, flush=True)
        sys.exit(1)
    print(f"[office-pdf] arranca (cada {INTERVALO}s, hasta {MAX_POR_VUELTA}/vuelta)", flush=True)
    while True:
        try:
            una_vuelta()
        except Exception as e:
            print(f"[office-pdf] vuelta con error: {type(e).__name__}: {e}", flush=True)
        time.sleep(INTERVALO)


if __name__ == "__main__":
    if "--una-vez" in sys.argv:
        print("convertidos:", una_vuelta())
    else:
        main()
