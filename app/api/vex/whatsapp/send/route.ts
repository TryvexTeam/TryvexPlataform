import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { enviarPlantillaPrimerContacto, whatsappConfigurado } from "@/lib/vex/whatsapp";
import { construirLinkWhatsApp } from "@/lib/vex/telefono";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

const bodySchema = z.object({
  lead_id: z.string().uuid(),
  texto: z.string().min(1),
  confirmar: z.literal(true),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const faltaConfirmar = raw && raw.confirmar !== true;
    if (faltaConfirmar) {
      return NextResponse.json({ error: "Falta confirmación humana" }, { status: 400 });
    }
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { lead_id, texto } = parsed.data;

  const { data: integrante } = await (supabase as SB)
    .from("dim_integrantes")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!integrante) {
    return NextResponse.json({ error: "Integrante no encontrado." }, { status: 404 });
  }
  const integranteId = integrante.id as string;

  const admin = createAdminClient() as SB;

  const { data: lead } = await admin
    .from("fact_leads")
    .select("id, nombre_negocio, telefono")
    .eq("id", lead_id)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead no encontrado." }, { status: 404 });
  }

  const { data: yaEnviado } = await admin
    .from("outreach_messages")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("canal", "whatsapp")
    .eq("estado", "enviado")
    .maybeSingle();

  if (yaEnviado) {
    return NextResponse.json({ error: "Ya se le envió el primer contacto" }, { status: 409 });
  }

  if (!whatsappConfigurado()) {
    const link = construirLinkWhatsApp(lead.telefono, texto);
    await admin.from("outreach_messages").insert({
      lead_id,
      canal: "whatsapp",
      texto,
      estado: "borrador",
      aprobado_por: integranteId,
    });
    return NextResponse.json({ fallback: true, link });
  }

  const resultado = await enviarPlantillaPrimerContacto(lead.telefono, lead.nombre_negocio);

  if (resultado.ok) {
    await admin.from("outreach_messages").insert({
      lead_id,
      canal: "whatsapp",
      texto,
      estado: "enviado",
      aprobado_por: integranteId,
      wa_message_id: resultado.proveedorId,
      enviado_at: new Date().toISOString(),
    });
    await admin
      .from("fact_leads")
      .update({ estado: "contactado", ultimo_contacto: new Date().toISOString() })
      .eq("id", lead_id);
    await admin.from("interacciones_lead").insert({
      lead_id,
      integrante_id: integranteId,
      tipo: "whatsapp",
      contenido: texto,
    });
    return NextResponse.json({ ok: true, proveedorId: resultado.proveedorId });
  }

  await admin.from("outreach_messages").insert({
    lead_id,
    canal: "whatsapp",
    texto,
    estado: "fallido",
    aprobado_por: integranteId,
    error: resultado.error,
  });
  return NextResponse.json({ ok: false, error: resultado.error }, { status: 502 });
}
