import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { generarDraftLead } from "@/lib/vex/draft";
import type { LeadResumen } from "@/lib/vex/cartera";
import { IntegrantesRepository } from "@/lib/repos/integrantes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/**
 * POST /api/vex/redactar  { lead_id, instrucciones? }
 *
 * Vex redacta el primer mensaje para UN lead, con los datos de ese negocio.
 * Devuelve solo el texto: **no manda nada y no guarda nada**. Quien envía es
 * una persona, desde el chat del lead.
 *
 * Reemplaza a `/api/vex/whatsapp/link`, que hacía lo mismo pero devolvía además
 * un `wa.me`. Ese link era del botón viejo que sacaba al equipo de la
 * plataforma; el PR #80 lo eliminó del panel y el endpoint quedó sin un solo
 * consumidor. Se reemplaza en vez de conservarse porque un endpoint llamado
 * "link" que ya no devuelve un link es una trampa para el que venga después.
 */

const bodySchema = z.object({
  lead_id: z.string().uuid(),
  instrucciones: z.string().max(500).optional(), // afinar el tono si el humano quiere
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Abajo se usa la clave de servicio para leer el lead entero, saltando la
  // RLS. Tener cuenta no basta para eso.
  const perfil = await new IntegrantesRepository(supabase).getByAuthUser(user.id);
  if (!perfil) return NextResponse.json({ error: "No eres integrante activo" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const admin = createAdminClient() as SB;
  const { data: lead } = await admin
    .from("fact_leads")
    .select("id,nombre_negocio,nicho,localidad,score,telefono,redes_sociales,tiene_web,info_texto,url_web")
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

  // Lo ya conversado con este negocio, para que un segundo mensaje retome en
  // vez de volver a presentarse. Si la consulta falla, se sigue sin historial:
  // quedarse sin redactar por eso sería peor que redactar un primer contacto.
  const { data: hilo } = await admin
    .from("mensajes_wa")
    .select("direccion, texto, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: true })
    .limit(30);

  const historial = (hilo ?? [])
    .filter((m: { texto?: string | null }) => m.texto?.trim())
    .map((m: { direccion: "in" | "out"; texto: string }) => ({
      direccion: m.direccion,
      texto: m.texto,
    }));

  const draft = await generarDraftLead(
    lead as LeadResumen,
    parsed.data.instrucciones,
    undefined,
    historial
  );
  const texto = draft.whatsapp?.text?.trim() || "";

  if (!texto) {
    // Sin texto no se devuelve un 200 vacío: quien llama tiene que poder
    // distinguir "Vex no pudo" de "Vex escribió algo".
    return NextResponse.json(
      { error: draft.aviso || "No se pudo generar el mensaje para este lead." },
      { status: 502 }
    );
  }

  return NextResponse.json({ lead_id: lead.id, texto });
}
