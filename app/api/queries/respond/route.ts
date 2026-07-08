import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"
import { dispatchRunnerResponse, dispatchAppRunnerResponse } from "@/lib/n8n-dispatch"
import { normalizeArea } from "@/lib/areas"

const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

type EstadoRespuesta = "disponible" | "no_disponible" | "ir_a_revisar"

export async function POST(request: Request) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const { sku, respuesta, consultaIds, estadoRespuesta, respuestaFija } = await request.json()
    const cleanSku = String(sku || "").trim().toUpperCase()
    const cleanAnswer = String(respuesta || "").trim()
    const cleanEstado: EstadoRespuesta =
      estadoRespuesta === "no_disponible"
        ? "no_disponible"
        : estadoRespuesta === "ir_a_revisar"
          ? "ir_a_revisar"
          : "disponible"
    const isFixed = Boolean(respuestaFija)
    const ids = Array.isArray(consultaIds) ? consultaIds.map((id) => String(id).trim()).filter(Boolean) : []

    if (!validSkuPattern.test(cleanSku) || ids.length === 0) {
      return NextResponse.json({ error: "Ingresa una respuesta valida." }, { status: 400 })
    }

    if (cleanEstado === "disponible" && cleanAnswer.length < 2) {
      return NextResponse.json({ error: "Ingresa una respuesta valida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    const { data: assignedRows, error: selectError } = await supabase
      .from("consultas_sku")
      .select("id,sku,marca_producto,area,estado,telefono_runner,local_id,canal")
      .in("id", ids)
      .eq("telefono_runner", runner.telefono)
      .in("estado", ["tomada", "en_revision"])

    if (selectError) throw selectError

    const assignedIds = (assignedRows || [])
      .filter((row) => String(row.sku || "").trim().toUpperCase() === cleanSku)
      .map((row) => row.id)

    if (assignedIds.length === 0) {
      return NextResponse.json({ error: "No tienes tickets asignados para este SKU." }, { status: 403 })
    }

    const firstAssigned = assignedRows?.find((row) => assignedIds.includes(row.id))
    const responseText =
      cleanEstado === "no_disponible"
        ? cleanAnswer || "Producto no disponible."
        : cleanEstado === "ir_a_revisar"
          ? cleanAnswer || "Estamos revisando el producto. Te notificaremos cuando el runner confirme disponibilidad."
          : cleanAnswer
    const responseArea = normalizeArea(firstAssigned?.area) || null
    const responseBrand = String(firstAssigned?.marca_producto || "").trim() || null

    // Determinar si alguna consulta es canal 'app'
    const appIds = (assignedRows || [])
      .filter((row) => assignedIds.includes(row.id) && row.canal === "app")
      .map((row) => row.id)
    const waIds = assignedIds.filter((id) => !appIds.includes(id))

    // Actualizar sku_productos
    try {
      if (cleanEstado === "no_disponible") {
        const { data: product } = await supabase
          .from("sku_productos")
          .select("sku,reportes_no_disponible")
          .eq("sku", cleanSku)
          .maybeSingle()

        if (product) {
          await supabase
            .from("sku_productos")
            .update({
              reportes_no_disponible: Number(product.reportes_no_disponible || 0) + 1,
              ultimo_reporte_no_disponible: now,
              ultimo_estado_reportado: "no_disponible",
              updated_at: now,
            })
            .eq("sku", cleanSku)
        } else {
          await supabase.from("sku_productos").insert({
            sku: cleanSku,
            marca_producto: responseBrand,
            area: responseArea,
            activo: true,
            reportes_no_disponible: 1,
            ultimo_reporte_no_disponible: now,
            ultimo_estado_reportado: "no_disponible",
            local_id: firstAssigned?.local_id || runner.localId || null,
            created_at: now,
            updated_at: now,
          })
        }
      } else if (cleanEstado === "disponible") {
        await supabase
          .from("sku_productos")
          .update({ ultimo_estado_reportado: "disponible", updated_at: now })
          .eq("sku", cleanSku)
      }
    } catch (productReportError) {
      console.warn("No se pudo actualizar reporte de producto", cleanSku, productReportError)
    }

    // Upsert en sku_respuestas
    if (cleanEstado !== "ir_a_revisar") {
      const { error: answerError } = await supabase.from("sku_respuestas").upsert(
        {
          sku: cleanSku,
          marca_producto: responseBrand,
          area: responseArea,
          respuesta: responseText,
          activo: true,
          respuesta_fija: isFixed,
          estado_respuesta: cleanEstado === "no_disponible" ? "no_disponible" : "disponible",
          expires_at: isFixed ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          telefono_runner: runner.telefono,
          nombre_runner: runner.nombre,
          ultima_respuesta_en: now,
          local_id: firstAssigned?.local_id || runner.localId || null,
        },
        { onConflict: "sku" },
      )
      if (answerError) throw answerError
    }

    // Consultas canal 'app': usar la funcion RPC que actualiza + crea mensajes + notificaciones
    let appResults: Array<{ consultaId: string; ok: boolean }> = []
    if (appIds.length > 0) {
      const { error: rpcError } = await supabase.rpc("register_runner_answer_for_app", {
        p_consulta_ids:    appIds,
        p_sku:             cleanSku,
        p_telefono_runner: runner.telefono,
        p_nombre_runner:   runner.nombre,
        p_respuesta:       responseText,
        p_estado_respuesta: cleanEstado,
        p_respuesta_fija:  isFixed,
        p_canal:           "app",
      })

      if (rpcError) throw rpcError

      appResults = await Promise.all(
        appIds.map(async (consultaId) => {
          const r = await dispatchAppRunnerResponse(consultaId)
          return { consultaId: String(consultaId), ...r }
        }),
      )
    }

    // Consultas canal 'whatsapp': actualizar directamente + dispatch WhatsApp
    let waResults: Array<{ consultaId: string; ok: boolean }> = []
    if (waIds.length > 0) {
      const { error: rpcError } = await supabase.rpc("register_runner_answer_for_app", {
        p_consulta_ids:    waIds,
        p_sku:             cleanSku,
        p_telefono_runner: runner.telefono,
        p_nombre_runner:   runner.nombre,
        p_respuesta:       responseText,
        p_estado_respuesta: cleanEstado,
        p_respuesta_fija:  isFixed,
        p_canal:           "whatsapp",
      })

      if (rpcError) throw rpcError

      const localId = firstAssigned?.local_id || runner.localId || null
      waResults = await Promise.all(
        waIds.map(async (consultaId) => {
          const r = await dispatchRunnerResponse(consultaId, localId)
          return { consultaId: String(consultaId), ...r }
        }),
      )
    }

    return NextResponse.json({
      ok: true,
      sku: cleanSku,
      estadoRespuesta: cleanEstado,
      updatedConsultas: assignedIds.length,
      appNotified: appResults.every((r) => r.ok),
      whatsappOk: waResults.every((r) => r.ok),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 500 })
  }
}
