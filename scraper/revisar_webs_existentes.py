"""Revisa las webs de los leads que ya estan en la base y guarda que ofrecen.

Corre una vez sobre la cartera actual. De ahi en adelante el scraper revisa
cada lead nuevo que traiga con sitio, asi que esto no hay que repetirlo salvo
que se quiera refrescar lo viejo (`--mas-viejo-que`).

    python revisar_webs_existentes.py --limite 10    # prueba
    python revisar_webs_existentes.py                # todos los pendientes
    python revisar_webs_existentes.py --mas-viejo-que 90

Requiere la migracion 106 aplicada (columnas `web_capacidades` y
`web_revisada_at`).
"""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timedelta, timezone

from supabase import create_client

from scraper import SUPABASE_URL, SUPABASE_KEY
from revisar_web import revisar_web


async def procesar(limite: int | None, mas_viejo_que: int | None) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Faltan las variables de Supabase en el .env (las mismas que usa scraper.py).")
        return

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    q = (
        sb.table("fact_leads")
        .select("id, nombre_negocio, url_web, web_revisada_at")
        .not_.is_("url_web", "null")
        .is_("eliminado_at", "null")
    )
    if mas_viejo_que is None:
        # Solo los que nunca miramos.
        q = q.is_("web_revisada_at", "null")
    else:
        corte = (datetime.now(timezone.utc) - timedelta(days=mas_viejo_que)).isoformat()
        q = q.or_(f"web_revisada_at.is.null,web_revisada_at.lt.{corte}")
    if limite:
        q = q.limit(limite)

    leads = q.execute().data
    print(f"Por revisar: {len(leads)}\n")

    resumen: dict[str, int] = {}
    sin_leer = 0

    for i, lead in enumerate(leads, 1):
        r = await revisar_web(lead["url_web"])
        sb.table("fact_leads").update(
            {
                "web_capacidades": r.como_dict(),
                "web_revisada_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", lead["id"]).execute()

        if not r.revisada:
            sin_leer += 1
        for c in r.capacidades:
            resumen[c] = resumen.get(c, 0) + 1

        estado = ", ".join(r.capacidades) if r.capacidades else ("NO SE PUDO LEER" if not r.revisada else "(vitrina)")
        nombre = lead["nombre_negocio"][:30]
        print(f"  [{i}/{len(leads)}] {nombre:32} {estado}")

    print("\n--- resumen ---")
    for c, n in sorted(resumen.items(), key=lambda x: -x[1]):
        print(f"  {c:12} {n}")
    print(f"  {'sin leer':12} {sin_leer}   <- no pudimos mirar, NO es 'no tiene'")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--limite", type=int, default=None, help="Maximo de leads a revisar")
    p.add_argument(
        "--mas-viejo-que",
        type=int,
        default=None,
        metavar="DIAS",
        help="Ademas de los nunca revisados, re-revisa los mirados hace mas de N dias",
    )
    a = p.parse_args()
    asyncio.run(procesar(a.limite, a.mas_viejo_que))
