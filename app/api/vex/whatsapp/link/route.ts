import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generarDraftLead } from "@/lib/vex/draft";
import { construirLinkWhatsApp } from "@/lib/vex/telefono";
import type { LeadResumen } from "@/lib/vex/cartera";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

// Botón 1 "Abrir en WhatsApp" (Ariel, tarea 9bb97f97): dado un lead, genera el
// mensaje personalizado de Vex y devuelve el link wa.me listo para abrir. Envío
// MANUAL desde el WhatsApp del humano — cero riesgo de ban, no manda nada solo.
// La vista de Leads (Jarvis) consume esto para pintar el botón.

const bodySchema = z.object({
  lead_id: z.string().uuid(),
  instrucciones: z.string().optional(), // afinar el tono si el humano quiere
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const admin = createAdminClient() as SB;
  const { data: lead } = await admin
    .from("fact_leads")
    .select("id,nombre_negocio,nicho,localidad,score,telefono,redes_sociales")
    .eq("id", parsed.data.lead_id)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead no encontrado." }, { status: 404 });
  }
  if (!lead.telefono) {
    return NextResponse.json(
      { error: "Este lead no tiene teléfono para WhatsApp." },
      { status: 422 }
    );
  }

  // Vex redacta el mensaje personalizado (PAS + datos del negocio).
  const draft = await generarDraftLead(lead as LeadResumen, parsed.data.instrucciones);

  // El link ya viene armado en el draft; si por algún motivo no, lo reconstruimos
  // desde el texto (defensa: normalizarTelefono limpia \n y símbolos del número).
  const texto = draft.whatsapp?.text?.trim() || "";
  const link = draft.whatsapp?.link || construirLinkWhatsApp(lead.telefono, texto);

  if (!link || !texto) {
    return NextResponse.json(
      { error: draft.aviso || "No se pudo generar el mensaje para este lead." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    lead_id: lead.id,
    nombre_negocio: lead.nombre_negocio,
    texto,
    link, // https://wa.me/<num>?text=<mensaje> — el humano lo abre y envía
  });
}
