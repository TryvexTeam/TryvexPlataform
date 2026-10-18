#!/usr/bin/env python3
"""
Rellena lat/lng de los leads que ya existen (migracion 127), para el mapa de leads.

Los leads nuevos traen sus coordenadas desde el scraper. Los viejos no: este
script abre la ficha de cada uno en Google Maps por su identificador
(`google_place_id` = "0x...:0x..."; la segunda mitad es el `cid` de Maps) y lee
las coordenadas de la URL a la que redirige, con la misma funcion del scraper.

Sin API pagada. Va despacio a proposito (unos segundos entre fichas) para no
parecer un robot apurado. Por defecto NO escribe nada: muestra lo que haria.

    python rellenar_coordenadas.py               # prueba: lee y muestra
    python rellenar_coordenadas.py --aplicar     # escribe lat/lng en fact_leads
    python rellenar_coordenadas.py --limite 20   # solo los primeros 20
"""
import argparse
import asyncio
import os
import random

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from supabase import create_client

from scraper import coordenadas_de_google

load_dotenv()


def cid_de(place_id: str):
    """El `cid` de Maps es la segunda mitad del place_id, en decimal."""
    try:
        return str(int(place_id.split(":")[1], 16))
    except (IndexError, ValueError, AttributeError):
        return None


async def main(aplicar: bool, limite: int) -> None:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise SystemExit("Faltan SUPABASE_URL y SUPABASE_KEY en el .env")
    sb = create_client(url, key)

    filas = (
        sb.table("fact_leads")
        .select("id, nombre_negocio, google_place_id")
        .is_("lat", "null")
        .is_("eliminado_at", "null")
        .not_.is_("google_place_id", "null")
        .limit(limite)
        .execute()
        .data
        or []
    )
    print(f"{len(filas)} leads sin coordenadas y con place_id")
    ok = sin_dato = 0

    async with async_playwright() as p:
        navegador = await p.chromium.launch(headless=True)
        pagina = await navegador.new_page(locale="es-CL")
        for fila in filas:
            cid = cid_de(fila["google_place_id"])
            if not cid:
                sin_dato += 1
                continue
            try:
                await pagina.goto(f"https://www.google.com/maps?cid={cid}&hl=es", timeout=30000)
                # La URL final (con !3d...!4d...) llega despues de la redireccion.
                await pagina.wait_for_url("**/maps/place/**", timeout=15000)
                await pagina.wait_for_timeout(1500)
            except Exception:
                pass
            lat, lng = coordenadas_de_google(pagina.url)
            if lat is None:
                sin_dato += 1
                print(f"  sin dato: {fila['nombre_negocio']}")
            else:
                ok += 1
                print(f"  {fila['nombre_negocio']}: {lat}, {lng}")
                if aplicar:
                    sb.table("fact_leads").update({"lat": lat, "lng": lng}).eq("id", fila["id"]).execute()
            await asyncio.sleep(random.uniform(2.5, 5.0))
        await navegador.close()

    print(f"\nCon coordenadas: {ok} · sin dato: {sin_dato}")
    if not aplicar:
        print("Modo prueba: no se escribio nada. Use --aplicar para guardarlas.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--aplicar", action="store_true")
    ap.add_argument("--limite", type=int, default=1000)
    a = ap.parse_args()
    asyncio.run(main(a.aplicar, a.limite))
