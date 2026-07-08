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

    let updateQuery = supabase
      .from("consultas_sku")
      .update({
        estado: "tomada",
        telefono_runner: runner.telefono,
        nombre_runner: runner.nombre,
        assigned_at: now,
      })
      .in("id", ids)
      .ilike("sku", cleanSku)
      .eq("estado", "pendiente_sin_asignar")
      .is("telefono_runner", null)

    if (runnerArea) {
      // Acepta consultas del área del runner O consultas sin área (ej. canal app sin área definida)
      updateQuery = updateQuery.or(`area.eq.${runnerArea},area.is.null`)
    }

    const { data: claimedRows, error: updateError } = await updateQuery.select("id,sku,area")

    if (updateError) throw updateError

    const claimableIds = (claimedRows || []).map((row) => row.id)

    if (claimableIds.length > 0) {
      return NextResponse.json({
        ok: true,
        sku: cleanSku,
        claimedConsultas: claimableIds.length,
        consultaIds: claimableIds,
      })
    }

    const { data: candidateRows, error: selectError } = await supabase
      .from("consultas_sku")
      .select("id,sku,area,estado,telefono_runner")
      .in("id", ids)

    if (selectError) throw selectError

    const rows = candidateRows || []
    const sameSkuRows = rows.filter((row) => String(row.sku || "").trim().toUpperCase() === cleanSku)
    const unavailableRows = sameSkuRows.filter(
      (row) => row.estado !== "pendiente_sin_asignar" || Boolean(row.telefono_runner),
    )
    const wrongAreaRows = sameSkuRows.filter((row) => {
      const rowArea = normalizeArea(row.area)
      return row.estado === "pendiente_sin_asignar" && !row.telefono_runner && runnerArea && rowArea !== runnerArea
    })

    if (wrongAreaRows.length > 0) {
      const area = normalizeArea(wrongAreaRows[0]?.area)
      return NextResponse.json(
        {
          error: `Este SKU pertenece a ${area || "otra area"} y tu usuario runner esta asignado a ${runnerArea || "sin area"}.`,
          reason: "AREA_NO_PERMITIDA",
        },
        { status: 409 },
      )
    }

    if (unavailableRows.length > 0) {
      return NextResponse.json(
        {
          error: "Estas consultas ya fueron tomadas o cambiaron de estado. Actualiza el dashboard.",
          reason: "YA_NO_DISPONIBLE",
        },
        { status: 409 },
      )
    }

    return NextResponse.json(
      { error: "Estas consultas ya no estan disponibles. Actualiza el dashboard.", reason: "NO_ENCONTRADA" },
      { status: 409 },
    )
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo tomar la consulta." }, { status: 500 })
  }
}
