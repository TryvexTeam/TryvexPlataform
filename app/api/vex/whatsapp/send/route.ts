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

  if (!whatsappConfigurado()) {
    const link = construirLinkWhatsApp(lead.telefono, texto);
    const { error: errorBorrador } = await admin.from("outreach_messages").insert({
      lead_id,
      canal: "whatsapp",
      texto,
      estado: "borrador",
      aprobado_por: integranteId,
    });
    if (errorBorrador) {
      console.error("[vex/whatsapp/send] error guardando borrador:", errorBorrador);
      return NextResponse.json(
        { ok: true, fallback: true, link, advertencia: "el link salió pero falló el registro del borrador" }
      );
    }
    return NextResponse.json({ fallback: true, link });
  }

  // Reservar ANTES de llamar a Meta: si dos aprobaciones llegan a la vez, el
  // unique parcial (lead_id, canal) WHERE estado='enviado' hace que solo una
  // reserva se inserte; la otra recibe 23505 y NUNCA llega a llamar a Meta.
  //
  // Caso de doble-fallo: si Meta falla Y el UPDATE que marca la fila como
  // 'fallido' (más abajo, tras el error de resultado) también falla, la fila
  // queda en estado='enviado' pero SIN wa_message_id. Esa fila sigue
  // bloqueando el unique parcial de arriba, así que cualquier reintento
  // futuro para el mismo (lead_id, canal) recibe 409 "Ya se le envió el
  // primer contacto" aunque en realidad nunca se envió nada.
  // Para detectar este caso: buscar filas outreach_messages con
  // estado='enviado' AND wa_message_id IS NULL.
  const { data: reserva, error: errorReserva } = await admin
    .from("outreach_messages")
    .insert({
      lead_id,
      canal: "whatsapp",
      texto,
      estado: "enviado",
      aprobado_por: integranteId,
    })
    .select("id")
    .single();

  if (errorReserva) {
    const esDuplicado =
      errorReserva.code === "23505" ||
      (typeof errorReserva.message === "string" && errorReserva.message.includes("duplicate key"));
    if (esDuplicado) {
      return NextResponse.json({ error: "Ya se le envió el primer contacto" }, { status: 409 });
    }
    console.error("[vex/whatsapp/send] error reservando el envío:", errorReserva);
    return NextResponse.json({ error: "No se pudo reservar el envío." }, { status: 500 });
  }

  const reservaId = reserva.id as string;
  const resultado = await enviarPlantillaPrimerContacto(lead.telefono, lead.nombre_negocio);

  if (resultado.ok) {
    const { error: errorUpdate } = await admin
      .from("outreach_messages")
      .update({
        wa_message_id: resultado.proveedorId,
        enviado_at: new Date().toISOString(),
      })
      .eq("id", reservaId);
    if (errorUpdate) {
      console.error("[vex/whatsapp/send] error actualizando outreach_messages:", errorUpdate);
    }

    const { error: errorLead } = await admin
      .from("fact_leads")
      .update({ estado: "contactado", ultimo_contacto: new Date().toISOString() })
      .eq("id", lead_id);
    if (errorLead) {
      console.error("[vex/whatsapp/send] error actualizando fact_leads:", errorLead);
    }

    const { error: errorInteraccion } = await admin.from("interacciones_lead").insert({
      lead_id,
      integrante_id: integranteId,
      tipo: "whatsapp",
      contenido: texto,
    });
    if (errorInteraccion) {
      console.error("[vex/whatsapp/send] error insertando interacciones_lead:", errorInteraccion);
    }

    if (errorUpdate || errorLead || errorInteraccion) {
      const partes: string[] = [];
      if (errorUpdate) partes.push("el registro del envío");
      if (errorLead) partes.push("el estado del lead");
      if (errorInteraccion) partes.push("la interacción");
      return NextResponse.json({
        ok: true,
        proveedorId: resultado.proveedorId,
        advertencia: `el mensaje salió pero falló el registro de ${partes.join(", ")}`,
      });
    }

    return NextResponse.json({ ok: true, proveedorId: resultado.proveedorId });
  }

  // Reintentos: si este UPDATE también falla, la fila queda 'enviado' sin
  // wa_message_id y bloquea el unique parcial para siempre (ver comentario
  // arriba). La mayoría de estos fallos son transitorios, así que un par de
  // reintentos cierra el caso de doble-fallo en la práctica.
  let errorFallido = null;
  for (let intento = 0; intento < 3; intento++) {
    if (intento > 0) await new Promise((r) => setTimeout(r, 300 * intento));
    const { error } = await admin
      .from("outreach_messages")
      .update({
        estado: "fallido",
        error: resultado.error,
      })
      .eq("id", reservaId);
    errorFallido = error;
    if (!errorFallido) break;
  }
  if (errorFallido) {
    console.error(
      "[vex/whatsapp/send] error registrando el fallo tras 3 intentos — fila",
      reservaId,
      "quedó 'enviado' sin wa_message_id, bloqueará reintentos para este lead:",
      errorFallido,
    );
  }
  return NextResponse.json({ ok: false, error: resultado.error }, { status: 502 });
}
