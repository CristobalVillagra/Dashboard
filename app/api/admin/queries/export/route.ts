import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { formatAreaLabel } from "@/lib/areas"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatEstado(estado: string | null) {
  if (estado === "respondido") return "Respondido"
  if (estado === "no_disponible") return "No disponible"
  if (estado === "en_revision") return "En revision"
  return estado || ""
}

function formatFecha(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago" })
}

export async function GET(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const desdeParam = searchParams.get("desde")
  const hastaParam = searchParams.get("hasta")
  const desde = parseDateParam(desdeParam)
  const hasta = parseDateParam(hastaParam, true)

  if (!desde || !hasta) {
    return NextResponse.json(
      { error: "Parametros desde y hasta requeridos (YYYY-MM-DD)." },
      { status: 400 },
    )
  }

  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha desde no puede ser posterior a hasta." }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("consultas_sku")
    .select("sku,telefono_picker,area,estado,respuesta_runner,nombre_runner,created_at")
    .in("estado", ["respondido", "no_disponible", "en_revision"])
    .gte("created_at", desde.toISOString())
    .lte("created_at", hasta.toISOString())
    .order("created_at", { ascending: false })

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar consultas." }, { status: 500 })
  }

  const rows = (data || []).map((row) => ({
    fecha: formatFecha(row.created_at),
    SKU: row.sku,
    "picker (telefono)": row.telefono_picker || "",
    area: formatAreaLabel(row.area),
    estado: formatEstado(row.estado),
    respuesta: row.respuesta_runner || "",
    "runner que respondio": row.nombre_runner || "",
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Consultas")
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer

  const filename = `consultas_${desdeParam}_${hastaParam}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
