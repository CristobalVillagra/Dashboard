import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

export async function POST(request: Request) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const { sku, respuesta, consultaIds, estadoRespuesta } = await request.json()
    const cleanSku = String(sku || "").trim().toUpperCase()
    const cleanAnswer = String(respuesta || "").trim()
    const cleanEstado = estadoRespuesta === "no_disponible" ? "no_disponible" : "respondido"
    const ids = Array.isArray(consultaIds) ? consultaIds.map((id) => String(id).trim()).filter(Boolean) : []

    if (!validSkuPattern.test(cleanSku) || ids.length === 0 || (cleanEstado === "respondido" && cleanAnswer.length < 2)) {
      return NextResponse.json({ error: "Ingresa una respuesta valida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    const { data: pendingRows, error: selectError } = await supabase
      .from("consultas_sku")
      .select("id,sku,marca_producto,area,estado,respuesta_runner")
      .in("id", ids)
      .is("respuesta_runner", null)
      .eq("estado", "pendiente")

    if (selectError) throw selectError

    const pendingIds = (pendingRows || [])
      .filter((row) => {
        const rowSku = String(row.sku || "").trim().toUpperCase()
        const isOpen = !["respondido", "respondida", "resuelta", "cerrada", "cancelada", "no_disponible"].includes(
          String(row.estado || "").toLowerCase(),
        )

        return rowSku === cleanSku && isOpen
      })
      .map((row) => row.id)

    if (pendingIds.length === 0) {
      return NextResponse.json({ error: "Este SKU ya no tiene consultas pendientes." }, { status: 409 })
    }

    const firstPending = pendingRows?.find((row) => pendingIds.includes(row.id))
    const responseText = cleanEstado === "no_disponible" ? cleanAnswer || "Producto no disponible." : cleanAnswer
    const responseArea = String(firstPending?.area || "").trim().toLowerCase() || null
    const responseBrand = String(firstPending?.marca_producto || "").trim() || null

    if (responseText) {
      const { error: deactivateError } = await supabase
        .from("sku_respuestas")
        .update({ activo: false })
        .eq("sku", cleanSku)
        .eq("activo", true)

      if (deactivateError) throw deactivateError

      const { error: answerError } = await supabase.from("sku_respuestas").insert({
        sku: cleanSku,
        marca_producto: responseBrand,
        area: responseArea,
        respuesta: responseText,
        activo: true,
        expires_at: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
        telefono_runner: runner.telefono,
        nombre_runner: runner.nombre,
        ultima_respuesta_en: now,
      })

      if (answerError) throw answerError
    }

    const { error: updateError } = await supabase
      .from("consultas_sku")
      .update({
        respuesta_runner: responseText,
        estado: cleanEstado,
        responded_at: now,
        whatsapp_enviado: false,
        telefono_runner: runner.telefono,
        nombre_runner: runner.nombre,
      })
      .in("id", pendingIds)

    if (updateError) throw updateError

    return NextResponse.json({
      ok: true,
      sku: cleanSku,
      updatedConsultas: pendingIds.length,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo guardar la respuesta." }, { status: 500 })
  }
}
