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
# LibreOffice dibuja fiel Word/Excel. NO puede con presentaciones (Impress falla
# hasta con un pptx vacío en este servidor), así que pptx/ppt/odp van por otra vía.
EXT_CONVERTIBLES = (".docx", ".doc", ".xlsx", ".xls", ".odt", ".ods", ".rtf")
EXT_PRESENTACION = (".pptx", ".ppt", ".odp")

# Los pptx ya intentados (bien o mal): NO se reintentan solos, para no quemar las
# 10 conversiones/día del plan gratis con un archivo que falla en loop. Para
# reintentar uno, se borra su línea de este archivo.
INTENTADOS_PATH = os.environ.get(
    "OFFICE_PDF_INTENTADOS", "/var/lib/tryvex-office-pdf/pptx-intentados.txt"
)


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
# La key puede venir del env del proceso (systemd) o del .env del scraper.
CLOUDCONVERT_KEY = os.environ.get("CLOUDCONVERT_API_KEY") or ENV.get("CLOUDCONVERT_API_KEY")


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


def listar_presentaciones():
    """Los pptx/ppt/odp del chat (van por CloudConvert, no por LibreOffice)."""
    url = SUPABASE_URL + "/rest/v1/mensaje_adjuntos?select=id,ruta,nombre"
    body, _ = _req(url)
    return [
        a for a in json.loads(body.decode())
        if (a.get("nombre") or "").lower().endswith(EXT_PRESENTACION)
    ]


def firmar_lectura(ruta, segundos=600):
    """URL firmada temporal para que CloudConvert baje el archivo (bucket privado)."""
    url = SUPABASE_URL + "/storage/v1/object/sign/" + BUCKET + "/" + urllib.parse.quote(ruta)
    body, _ = _req(
        url, data=json.dumps({"expiresIn": segundos}).encode(),
        method="POST", headers={"Content-Type": "application/json"},
    )
    firmada = json.loads(body.decode())["signedURL"]
    return SUPABASE_URL + "/storage/v1" + firmada


def _cc(path, data=None, method="GET"):
    """Una llamada a la API de CloudConvert (bearer token)."""
    req = urllib.request.Request(
        "https://api.cloudconvert.com/v2" + path,
        data=json.dumps(data).encode() if data is not None else None,
        method=method,
        headers={
            "Authorization": "Bearer " + CLOUDCONVERT_KEY,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def convertir_presentacion(ruta, nombre):
    """
    Convierte un pptx/ppt/odp a PDF con CloudConvert y devuelve los bytes del PDF.

    Un "job" con tres tareas: importar (desde la URL firmada de Supabase),
    convertir a pdf, exportar (a una URL que CloudConvert nos da para bajar el
    resultado). El archivo sale a CloudConvert UNA vez, acá; el PDF que vuelve se
    guarda como nuestro y de ahí en adelante todo es local.
    """
    ext = os.path.splitext(nombre)[1].lstrip(".").lower() or "pptx"
    origen = firmar_lectura(ruta)
    job = _cc("/jobs", method="POST", data={"tasks": {
        "importar": {"operation": "import/url", "url": origen},
        "convertir": {
            "operation": "convert", "input": "importar",
            "input_format": ext, "output_format": "pdf",
        },
        "exportar": {"operation": "export/url", "input": "convertir"},
    }})
    job_id = job["data"]["id"]

    # Esperar a que termine (el plan gratis da hasta 5 min de proceso).
    limite = time.time() + 240
    export = None
    while time.time() < limite:
        estado = _cc("/jobs/" + job_id)["data"]
        if estado["status"] == "error":
            raise RuntimeError("CloudConvert marcó el job como error")
        for t in estado.get("tasks", []):
            if t["name"] == "exportar" and t["status"] == "finished":
                export = t
                break
        if export:
            break
        time.sleep(3)
    if not export:
        raise RuntimeError("CloudConvert no terminó a tiempo")

    archivos = export.get("result", {}).get("files", [])
    if not archivos:
        raise RuntimeError("CloudConvert no devolvió archivo")
    with urllib.request.urlopen(archivos[0]["url"], timeout=120) as r:
        return r.read()


def _leer_intentados():
    try:
        with open(INTENTADOS_PATH, encoding="utf-8") as f:
            return {ln.strip() for ln in f if ln.strip()}
    except FileNotFoundError:
        return set()


def _anotar_intentado(id_adjunto):
    os.makedirs(os.path.dirname(INTENTADOS_PATH), exist_ok=True)
    with open(INTENTADOS_PATH, "a", encoding="utf-8") as f:
        f.write(id_adjunto + "\n")


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
    ya = pdfs_existentes()
    hechos = 0

    # Word / Excel: LibreOffice, local.
    for a in [x for x in listar_office() if x["id"] not in ya][:MAX_POR_VUELTA]:
        try:
            datos = descargar(a["ruta"])
            pdf = convertir_a_pdf(a["nombre"], datos)
            subir_pdf(a["id"], pdf)
            print(f"[office-pdf] {a['nombre']} -> {len(pdf)} bytes", flush=True)
            hechos += 1
        except Exception as e:
            # Un archivo que no convierte no frena a los demás; se anota y sigue.
            print(f"[office-pdf] FALLÓ {a.get('nombre')}: {e}", flush=True)

    # Presentaciones: CloudConvert (solo si hay key). Máx 1 por vuelta y sin
    # reintentar las ya intentadas: así el plan gratis (10/día) no se quema.
    if CLOUDCONVERT_KEY:
        intentados = _leer_intentados()
        for a in listar_presentaciones():
            if a["id"] in ya or a["id"] in intentados:
                continue
            _anotar_intentado(a["id"])  # se marca ANTES: un fallo no se reintenta solo
            try:
                pdf = convertir_presentacion(a["ruta"], a["nombre"])
                subir_pdf(a["id"], pdf)
                print(f"[office-pdf] (cc) {a['nombre']} -> {len(pdf)} bytes", flush=True)
                hechos += 1
            except Exception as e:
                print(f"[office-pdf] (cc) FALLÓ {a.get('nombre')}: {e}", flush=True)
            break  # una presentación por vuelta

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
