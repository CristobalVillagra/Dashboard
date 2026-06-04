import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

type Consulta = {
  id: string
  sku: string
  marca_producto: string | null
  area: string | null
  telefono_picker: string | null
  mensaje_original: string | null
  estado: string | null
  respuesta_runner: string | null
  created_at: string | null
}

const closedStates = new Set(["respondido", "respondida", "resuelta", "cerrada", "cancelada", "no_disponible"])
const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

function groupBySku(rows: Consulta[]) {
  const groups = new Map<string, Consulta[]>()

  for (const row of rows) {
    const sku = String(row.sku || "").trim().toUpperCase()
    const area = normalizeArea(row.area)
    const marca = String(row.marca_producto || "").trim()

    if (
      !validSkuPattern.test(sku) ||
      !area ||
      row.respuesta_runner ||
      closedStates.has(String(row.estado || "").toLowerCase())
    ) {
      continue
    }

    const groupKey = [sku, area || "sin-area", marca.toLowerCase()].join("|")
    const normalizedRow = { ...row, sku, area, marca_producto: marca || null }
    const current = groups.get(groupKey) || []
    current.push(normalizedRow)
    groups.set(groupKey, current)
  }

  return Array.from(groups.entries())
    .map(([, items]) => {
      const sorted = [...items].sort((a, b) => {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      })
      const first = sorted[0]

      return {
        sku: first?.sku || "",
        marcaProducto: first?.marca_producto || "",
        area: first?.area || null,
        total: items.length,
        oldestDate: first?.created_at || null,
        sampleMessage: first?.mensaje_original || "",
        pickers: Array.from(new Set(items.map((item) => item.telefono_picker).filter(Boolean))),
        consultaIds: items.map((item) => item.id),
      }
    })
    .sort((a, b) => b.total - a.total || new Date(a.oldestDate || 0).getTime() - new Date(b.oldestDate || 0).getTime())
}

function normalizeArea(area: string | null | undefined) {
  const cleanArea = String(area || "").trim().toLowerCase()

  if (cleanArea === "frio" || cleanArea === "sala" || cleanArea === "gm") {
    return cleanArea
  }

  return null
}

export async function GET() {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from("consultas_sku")
    .select("id,sku,marca_producto,area,telefono_picker,mensaje_original,estado,respuesta_runner,created_at")
    .is("respuesta_runner", null)
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true })
    .limit(1000)

  const runnerArea = normalizeArea(runner.area)
  if (runnerArea) {
    query = query.eq("area", runnerArea)
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar las consultas." }, { status: 500 })
  }

  const rows = ((data || []) as Consulta[]).filter((row) => {
    return (
      validSkuPattern.test(String(row.sku || "").trim().toUpperCase()) &&
      Boolean(normalizeArea(row.area))
    )
  })
  const groups = groupBySku(rows)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { count: answeredToday } = await supabase
    .from("consultas_sku")
    .select("id", { count: "exact", head: true })
    .in("estado", ["respondido", "no_disponible"])
    .gte("responded_at", today.toISOString())

  return NextResponse.json({
    runner,
    metrics: {
      pendingConsultas: rows.filter((row) => !closedStates.has(String(row.estado || "").toLowerCase())).length,
      pendingSkus: groups.length,
      topSku: groups[0]?.sku || null,
      topSkuCount: groups[0]?.total || 0,
      answeredToday: answeredToday || 0,
    },
    groups,
  })
}
