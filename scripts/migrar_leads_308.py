# -*- coding: utf-8 -*-
"""Migra los leads de la BD vieja (leads-dashboard, muerta) al CRM real (fact_leads).

Contexto: el leads-dashboard de Railway murió; Vex lo reemplaza. Sus ~308 leads
tienen que pasar al CRM `TryvexPlataform` para que Vex tenga con quién trabajar.

- ORIGEN: Supabase del leads-dashboard (`leads-dashboard/.env.local`: SUPABASE_URL +
  SUPABASE_SERVICE_KEY). Tabla vieja `fact_leads` (id bigserial).
- DESTINO: Supabase del CRM (`TryvexPlataform/.env.local`: NEXT_PUBLIC_SUPABASE_URL +
  SUPABASE_SERVICE_ROLE_KEY). Tabla nueva `fact_leads` (id uuid, otro esquema).

Ambos por la REST API (PostgREST), sin psycopg2.

SEGURIDAD: por defecto es DRY-RUN (no escribe nada, solo muestra el plan). Para
aplicar de verdad al CRM real: --aplicar. Deduplica por teléfono normalizado
(o nombre+localidad si no hay teléfono), contra el origen Y contra lo que ya
exista en el destino.

Uso:
    python migrar_leads_308.py            # prueba: muestra qué haría
    python migrar_leads_308.py --aplicar  # escribe de verdad en el CRM
"""
import sys, os, re, json, pathlib, argparse
import requests

RAIZ = pathlib.Path(__file__).resolve().parents[2]   # Desktop/
ENV_VIEJO = RAIZ / "leads-dashboard" / ".env.local"
ENV_NUEVO = RAIZ / "TryvexPlataform" / ".env.local"

# old estado -> new estado (enum del CRM)
MAP_ESTADO = {
    "nuevo": "sin_contactar", "sin_contactar": "sin_contactar",
    "contactado": "contactado", "interesado": "interesado",
    "reunion_agendada": "reunion_agendada", "cerrado": "cerrado",
    "descartado": "descartado",
}


def _env(path, *claves):
    d = {}
    for ln in path.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln and not ln.startswith("#") and "=" in ln:
            k, v = ln.split("=", 1)
            d[k.strip()] = v.strip().strip('"').strip("'")
    faltan = [c for c in claves if not d.get(c)]
    if faltan:
        raise SystemExit(f"Faltan en {path.name}: {', '.join(faltan)}")
    return {c: d[c] for c in claves}


def _tel(t):
    """Normaliza teléfono a solo dígitos para deduplicar."""
    return re.sub(r"\D", "", t or "") or None


def _clave_dedupe(nombre, telefono, localidad):
    return _tel(telefono) or f"{(nombre or '').strip().lower()}|{(localidad or '').strip().lower()}"


def _a_nuevo(v):
    """Mapea una fila vieja al esquema nuevo de fact_leads."""
    nombre = (v.get("nombre") or "").strip()
    if not nombre:
        return None  # nombre_negocio es NOT NULL

    # redes (text viejo) -> jsonb
    redes = (v.get("redes") or "").strip()
    redes_json = {"origen_texto": redes} if redes else None

    # datos de contexto que el esquema nuevo no tiene columna -> a 'notas'
    ctx = []
    if v.get("rating") is not None:      ctx.append(f"Rating Google: {v['rating']}")
    if v.get("num_resenas") is not None: ctx.append(f"Reseñas: {v['num_resenas']}")
    if v.get("horario"):                 ctx.append(f"Horario: {v['horario']}")
    if v.get("direccion"):               ctx.append(f"Dirección: {v['direccion']}")
    notas = " · ".join(ctx) or None

    # OJO: el CRM cambió la escala en la migración 003 → score va de 1 a 10
    # (constraint fact_leads_score_check: BETWEEN 1 AND 10). La BD vieja usa 0-100.
    # Se convierte dividiendo por 10 y clampeando a [1,10].
    score = v.get("score")
    try:
        score = max(1, min(10, round(int(score) / 10))) if score is not None else 5
    except (TypeError, ValueError):
        score = 5

    fila = {
        "nombre_negocio": nombre,
        "telefono": v.get("telefono") or None,
        "info_texto": v.get("info_texto") or None,
        "redes_sociales": redes_json,
        "tiene_web": bool(v.get("tiene_web")),
        "nicho": v.get("nicho") or None,
        "localidad": (v.get("direccion") or None),   # mejor calce disponible
        "score": score,
        "estado": MAP_ESTADO.get((v.get("estado") or "nuevo").strip().lower(), "sin_contactar"),
        "origen": "scraper",                          # venían del scraper
        "notas": notas,
    }
    if v.get("created_at"):
        fila["created_at"] = v["created_at"]
    return fila


def _traer(url, key, tabla, cols="*"):
    r = requests.get(
        f"{url.rstrip('/')}/rest/v1/{tabla}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        params={"select": cols, "limit": "2000"}, timeout=60)
    r.raise_for_status()
    return r.json()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true", help="escribir de verdad en el CRM")
    a = ap.parse_args()

    viejo = _env(ENV_VIEJO, "SUPABASE_URL", "SUPABASE_SERVICE_KEY")
    nuevo = _env(ENV_NUEVO, "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")

    print("[1/4] leyendo leads viejos...")
    origen = _traer(viejo["SUPABASE_URL"], viejo["SUPABASE_SERVICE_KEY"], "fact_leads")
    print(f"      {len(origen)} leads en la BD vieja")

    print("[2/4] leyendo leads que YA están en el CRM (para no duplicar)...")
    destino = _traer(nuevo["NEXT_PUBLIC_SUPABASE_URL"], nuevo["SUPABASE_SERVICE_ROLE_KEY"],
                     "fact_leads", "nombre_negocio,telefono,localidad")
    ya = {_clave_dedupe(d.get("nombre_negocio"), d.get("telefono"), d.get("localidad")) for d in destino}
    print(f"      {len(destino)} ya en el CRM")

    print("[3/4] mapeando y deduplicando...")
    a_migrar, saltados_dupe, saltados_sinnombre, vistos = [], 0, 0, set()
    for v in origen:
        fila = _a_nuevo(v)
        if fila is None:
            saltados_sinnombre += 1
            continue
        clave = _clave_dedupe(fila["nombre_negocio"], fila["telefono"], fila["localidad"])
        if clave in ya or clave in vistos:
            saltados_dupe += 1
            continue
        vistos.add(clave)
        a_migrar.append(fila)

    print(f"      -> {len(a_migrar)} nuevos a migrar")
    print(f"      -> {saltados_dupe} saltados (duplicados)")
    print(f"      -> {saltados_sinnombre} saltados (sin nombre de negocio)")
    if a_migrar:
        ej = a_migrar[0]
        print(f"      ejemplo: {ej['nombre_negocio']!r} · tel {ej['telefono']} · {ej['estado']} · score {ej['score']}")

    if not a.aplicar:
        print("\n[4/4] DRY-RUN: no se escribió nada. Corré con --aplicar para migrar de verdad.")
        return

    print(f"\n[4/4] escribiendo {len(a_migrar)} leads en el CRM real...")
    url = nuevo["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = nuevo["SUPABASE_SERVICE_ROLE_KEY"]
    H = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}
    escritos = 0
    for i in range(0, len(a_migrar), 50):
        lote = a_migrar[i:i+50]
        r = requests.post(f"{url}/rest/v1/fact_leads", headers=H, data=json.dumps(lote), timeout=60)
        if not r.ok:
            print(f"      ERROR en lote {i//50+1}: {r.status_code} {r.text[:200]}")
            sys.exit(1)
        escritos += len(lote)
        print(f"      {escritos}/{len(a_migrar)}...")
    print(f"[ok] {escritos} leads migrados al CRM.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
