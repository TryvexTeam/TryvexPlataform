import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { clasificarIntencion, type Accion, type Turno } from "@/lib/vex/intenciones";
import {
  reporteCartera,
  recomendarLeads,
  buscarLeadsPorNombre,
  marcarEstado,
  ESTADOS_LEAD,
  type EstadoLead,
} from "@/lib/vex/cartera";
import { generarDraftLead, type DraftLead } from "@/lib/vex/draft";
import { llmTexto } from "@/lib/vex/llm";

const RESPUESTA_GROQ_CAIDO =
  "Groq está sin cuota o caído, dame unos minutos y reintentá.";

function esErrorGroq(e: unknown): boolean {
  // Solo consideramos "error de Groq" los errores marcados explícitamente
  // por las llamadas a llmJSON/llmTexto (ver marcarErrorLLM más abajo).
  // Antes esto matcheaba substrings amplios sobre CUALQUIER error del bloque
  // try (incluyendo errores de Supabase), lo que mostraba "Groq está sin
  // cuota" sin loguear nada real.
  return e instanceof Error && (e as Error & { esErrorLLM?: boolean }).esErrorLLM === true;
}

function marcarErrorLLM(e: unknown): never {
  const error = e instanceof Error ? e : new Error(String(e));
  (error as Error & { esErrorLLM?: boolean }).esErrorLLM = true;
  throw error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function ejecutarAccion(
  sb: SB,
  a: Accion
): Promise<{ tipo: string; datos: unknown; borradores?: DraftLead[] }> {
  switch (a.tipo) {
    case "reporte":
      return { tipo: a.tipo, datos: await reporteCartera(sb) };

    case "recomendar":
      return {
        tipo: a.tipo,
        datos: await recomendarLeads(sb, {
          nicho: a.nicho,
          localidad: a.localidad,
          cantidad: a.cantidad,
          estado: a.estado,
        }),
      };

    case "marcar": {
      const estado = (ESTADOS_LEAD as readonly string[]).includes(a.estado)
        ? (a.estado as EstadoLead)
        : undefined;
      if (!estado) {
        return { tipo: a.tipo, datos: { error: `Estado inválido: ${a.estado}` } };
      }
      const idsPorNombre: string[] = [];
      const sinMatch: string[] = [];
      for (const nombre of a.nombres) {
        const encontrados = await buscarLeadsPorNombre(sb, nombre, 5);
        if (encontrados.length === 1) idsPorNombre.push(encontrados[0].id);
        else sinMatch.push(nombre);
      }
      const actualizados = idsPorNombre.length
        ? await marcarEstado(sb, idsPorNombre, estado)
        : 0;
      return { tipo: a.tipo, datos: { actualizados, estado, sinMatch } };
    }

    case "preparar_envio": {
      // Si no pidieron una cantidad, se generan 3 y no 10. Ignacio pidió
      // mensajes y le llegó una parrilla: tuvo que aclarar "dame solo para una
      // persona". Cada borrador hay que leerlo antes de enviarlo, así que un
      // lote grande sin pedirlo empuja a aprobar a ciegas — que es justo lo que
      // no queremos con clientes reales. Pedir más es una frase; deshacer un
      // mensaje enviado, no.
      const leads = await recomendarLeads(sb, {
        nicho: a.nicho,
        localidad: a.localidad,
        cantidad: Math.min(a.cantidad ?? 3, 10),
      });
      const borradores = await Promise.all(
        leads.map((lead) => generarDraftLead(lead, a.instrucciones).catch(marcarErrorLLM))
      );
      return {
        tipo: a.tipo,
        // Los filtros viajan con el resultado para poder decir QUE se busco
        // cuando no aparece nada. Sin eso, un rubro mal entendido se ve igual
        // que una cartera vacia.
        datos: { total: borradores.length, nicho: a.nicho, localidad: a.localidad },
        borradores,
      };
    }

    case "conversar":
    default:
      return { tipo: "conversar", datos: null };
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const mensaje = typeof body?.mensaje === "string" ? body.mensaje.trim() : "";
  if (!mensaje) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

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

  try {
    const { data: historialRaw } = await admin
      .from("vex_conversaciones")
      .select("rol, texto")
      .eq("integrante_id", integranteId)
      .order("created_at", { ascending: false })
      .limit(20);

    const historial: Turno[] = ((historialRaw ?? []) as Turno[]).slice().reverse();

    const acciones = await clasificarIntencion(mensaje, historial).catch(marcarErrorLLM);

    const resultados: { tipo: string; datos: unknown }[] = [];
    let borradores: DraftLead[] | undefined;

    for (const a of acciones) {
      const r = await ejecutarAccion(supabase, a);
      resultados.push({ tipo: r.tipo, datos: r.datos });
      if (r.borradores) borradores = r.borradores;
    }

    // Los resultados se traducen a frases antes de dárselos al modelo. Antes se
    // le pasaba el JSON crudo (`{"tipo":"preparar_envio","datos":{"total":10}}`)
    // y tenía que adivinar qué era cada número: con eso escribió "Total de
    // caracteres permitidos: 10", que no significa nada. Un dato sin etiqueta es
    // material para inventar, acá igual que en el redactor.
    const resumen = resultados
      .map((r) => {
        const d = r.datos as Record<string, unknown> | null
        if (r.tipo === "preparar_envio") {
          const n = Number(d?.total ?? 0)
          if (n > 0) {
            return `Se prepararon ${n} borrador${n === 1 ? "" : "es"}, uno por negocio. Aparecen abajo, listos para revisar. Si quiere más, tiene que decir cuántos.`
          }
          // Decir QUE se busco, no solo que no habia nada. Con "no se
          // encontraron leads" a secas, un filtro mal entendido (pedir el rubro
          // "distinto nicho", por ejemplo) se ve igual que una cartera vacia.
          const filtros = [
            d?.nicho ? `del rubro "${d.nicho}"` : null,
            d?.localidad ? `en "${d.localidad}"` : null,
          ].filter(Boolean).join(" ")
          return filtros
            ? `No hay leads sin contactar ${filtros}. Puede ser que el rubro no exista en la cartera: conviene probar sin ese filtro o con otro nombre.`
            : "No hay leads sin contactar con teléfono disponible, así que no hay borradores."
        }
        return `${r.tipo}: ${JSON.stringify(d)}`
      })
      .join("\n")

    const promptRespuesta = `
Eres Vex, el agente de Tryvex: compañero directo, chileno neutro, cero humo; respondes
corto y concreto. Hablas de tú ("tienes", "quieres"), nunca de vos ("tenés", "querés").

El usuario dijo: "${mensaje}"

Esto es lo que pasó de verdad (no inventes nada más, y cúbrelo todo):
${resumen}

Escribe una respuesta corta y útil basada solo en eso. Una o dos frases. No repitas el
contenido de los borradores: ya se ven abajo.
`.trim();

    const respuesta = (await llmTexto(promptRespuesta).catch(marcarErrorLLM)) || "Listo.";

    await admin.from("vex_conversaciones").insert([
      { integrante_id: integranteId, rol: "user", texto: mensaje },
      { integrante_id: integranteId, rol: "vex", texto: respuesta },
    ]);

    return NextResponse.json({ respuesta, borradores });
  } catch (error) {
    if (esErrorGroq(error)) {
      console.error("[vex/chat] error real:", error);
      return NextResponse.json({ respuesta: RESPUESTA_GROQ_CAIDO });
    }
    console.error("Vex chat error:", error);
    return NextResponse.json({ error: "Error en el chat de Vex." }, { status: 500 });
  }
}
