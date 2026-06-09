import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"
import { normalizeArea } from "@/lib/areas"

const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

export async function POST(request: Request) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const { sku, consultaIds } = await request.json()
    const cleanSku = String(sku || "").trim().toUpperCase()
    const ids = Array.isArray(consultaIds) ? consultaIds.map((id) => String(id).trim()).filter(Boolean) : []

    if (!validSkuPattern.test(cleanSku) || ids.length === 0) {
      return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()
    const runnerArea = normalizeArea(runner.area)

    const { data: pendingRows, error: selectError } = await supabase
      .from("consultas_sku")
      .select("id,sku,area,estado,telefono_runner")
      .in("id", ids)
      .eq("estado", "pendiente_sin_asignar")
      .is("telefono_runner", null)

    if (selectError) throw selectError

    const claimableIds = (pendingRows || [])
      .filter((row) => {
        const rowSku = String(row.sku || "").trim().toUpperCase()
        const rowArea = normalizeArea(row.area)
        return rowSku === cleanSku && (!runnerArea || rowArea === runnerArea)
      })
      .map((row) => row.id)

    if (claimableIds.length === 0) {
      return NextResponse.json({ error: "Estas consultas ya no estan disponibles." }, { status: 409 })
    }

    const { error: updateError } = await supabase
      .from("consultas_sku")
      .update({
        estado: "tomada",
        telefono_runner: runner.telefono,
        nombre_runner: runner.nombre,
        assigned_at: now,
      })
      .in("id", claimableIds)

    if (updateError) throw updateError

    return NextResponse.json({
      ok: true,
      sku: cleanSku,
      claimedConsultas: claimableIds.length,
      consultaIds: claimableIds,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo tomar la consulta." }, { status: 500 })
  }
}
