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

function formatResponseTime(createdAt: string | null, respondedAt: string | null) {
  if (!createdAt || !respondedAt) return "Sin respuesta"
  const diffMs = new Date(respondedAt).getTime() - new Date(createdAt).getTime()
  if (diffMs < 0) return "Sin respuesta"
  const totalSec = Math.floor(diffMs / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}m ${sec}s`
}

function formatClasificacion(estadoRespuesta: string | null) {
  if (estadoRespuesta === "disponible") return "Disponible"
  if (estadoRespuesta === "no_disponible") return "No disponible"
  if (estadoRespuesta === "ir_a_revisar") return "Ir a revisar"
  return "Sin clasificar"
}

function formatCanal(canal: string | null) {
  if (canal === "whatsapp") return "WhatsApp"
  if (canal === "app") return "App"
  return canal || ""
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
    .select("id,sku,telefono_picker,area,estado,estado_respuesta,respuesta_runner,nombre_runner,created_at,responded_at,canal")
    .in("estado", ["respondido", "no_disponible", "en_revision"])
    .gte("created_at", desde.toISOString())
    .lte("created_at", hasta.toISOString())
    .order("created_at", { ascending: false })

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar consultas." }, { status: 500 })
  }

  const consultaIds = (data || []).map((row) => row.id).filter(Boolean)
  const messageCountMap = new Map<number, number>()

  if (consultaIds.length > 0) {
    const { data: messageRows, error: messageError } = await supabase
      .from("consulta_sku_mensajes")
      .select("consulta_id")
      .in("consulta_id", consultaIds)

    if (messageError) {
      console.error(messageError)
    } else {
      for (const row of messageRows || []) {
        const consultaId = Number(row.consulta_id)
        messageCountMap.set(consultaId, (messageCountMap.get(consultaId) || 0) + 1)
      }
    }
  }

  const rows = (data || []).map((row) => ({
    fecha: formatFecha(row.created_at),
    SKU: row.sku,
    "picker (telefono)": row.telefono_picker || "",
    area: formatAreaLabel(row.area),
    estado: formatEstado(row.estado),
    respuesta: row.respuesta_runner || "",
    "runner que respondio": row.nombre_runner || "",
    canal: formatCanal(row.canal),
    tiempo_respuesta: formatResponseTime(row.created_at, row.responded_at),
    clasificacion: formatClasificacion(row.estado_respuesta),
    mensajes: messageCountMap.get(Number(row.id)) || 0,
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
