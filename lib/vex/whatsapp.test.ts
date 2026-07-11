import { describe, it, expect, vi } from "vitest";
import { enviarPlantillaPrimerContacto } from "./whatsapp";

describe("enviarPlantillaPrimerContacto", () => {
  it("sin config devuelve error claro sin llamar a Meta", async () => {
    const f = vi.fn();
    const r = await enviarPlantillaPrimerContacto("987654321", "Panadería", f);
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("con config manda la plantilla y devuelve el id", async () => {
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    process.env.WHATSAPP_TEMPLATE_NAME = "primer_contacto";
    const f = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }));
    const r = await enviarPlantillaPrimerContacto("987654321", "Panadería", f as never);
    expect(r).toEqual({ ok: true, proveedorId: "wamid.X" });
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TEMPLATE_NAME;
  });
});
