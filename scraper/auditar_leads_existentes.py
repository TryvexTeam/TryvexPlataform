#!/usr/bin/env python3
"""Audita los leads existentes marcados `tiene_web=false` contra la nueva
verificacion por nombre (ver `slug_dominio`/`buscar_web_por_nombre` en
scraper.py).

Por que existe: el scraper solo corre la verificacion nueva sobre negocios
que encuentra en una corrida futura. Los leads que YA estan en la base desde
antes de este fix se quedaron con `tiene_web=false` sin pasar por el chequeo
-- este script los revisa una vez, a mano, sin esperar a que se re-scrapeen.

Solo LEE y reporta. No modifica ningun lead: decidir que hacer con los que
encuentre (marcarlos, revisarlos a mano, descartarlos) queda para el equipo,
no para este script -- el mismo criterio que ya rige el resto del scraper
(nunca afirmar algo que no se verifico con certeza).

Usa las mismas variables de entorno que scraper.py (mismo .env del VPS, sin
credenciales nuevas que configurar).

Uso (como usuario `scraper`, con el .env del VPS ya cargado):
    .venv/bin/python auditar_leads_existentes.py
    .venv/bin/python auditar_leads_existentes.py --limite 50
"""
import argparse
import asyncio

from supabase import create_client

from scraper import SUPABASE_URL, SUPABASE_KEY, buscar_web_por_nombre


async def auditar(limite: int | None) -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Faltan las variables de entorno de Supabase en el .env (las mismas que usa scraper.py).")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    query = (
        supabase.table("fact_leads")
        .select("id, nombre_negocio, telefono, estado")
        .eq("tiene_web", False)
        .eq("origen", "scraper")
    )
    if limite:
        query = query.limit(limite)
    leads = query.execute().data

    print(f"Revisando {len(leads)} leads marcados \"sin web\"...\n")

    encontrados = []
    for lead in leads:
        nombre = lead["nombre_negocio"]
        web = await buscar_web_por_nombre(nombre)
        if web:
            encontrados.append((lead, web))
            print(f"  [POSIBLE WEB] {nombre}  (id={lead['id']}, estado={lead['estado']})  -> {web}")

    print(f"\n{len(encontrados)} de {len(leads)} podrian tener web real y no detectada por Maps.")
    print("Esto NO modifico nada en la base -- es solo para que el equipo revise a mano.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limite", type=int, default=None, help="Maximo de leads a revisar (por defecto: todos)")
    args = parser.parse_args()
    asyncio.run(auditar(args.limite))
