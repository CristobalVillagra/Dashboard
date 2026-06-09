import { NextResponse } from "next/server"
import { normalizeArea } from "@/lib/areas"
import { groupConsultasBySku, type ConsultaRow } from "@/lib/query-groups"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

export async function GET(request: Request) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const view = new URL(request.url).searchParams.get("view") || "available"
  const areaParam = new URL(request.url).searchParams.get("area")
  const supabase = getSupabaseAdmin()
  const runnerArea = normalizeArea(runner.area)

  let query = supabase
    .from("consultas_sku")
    .select(
      "id,sku,marca_producto,area,telefono_picker,mensaje_original,estado,respuesta_runner,created_at,assigned_at",
    )
    .order("created_at", { ascending: true })
    .limit(1000)

  if (view === "mine") {
    query = query
      .eq("telefono_runner", runner.telefono)
      .in("estado", ["tomada", "en_revision", "respondido", "no_disponible"])
  } else {
    query = query.eq("estado", "pendiente_sin_asignar").is("telefono_runner", null)

    if (areaParam === "todas") {
      // Sin filtro por area.
    } else if (areaParam) {
      const selectedArea = normalizeArea(areaParam)
      if (selectedArea) {
        query = query.eq("area", selectedArea)
      }
    } else if (runnerArea) {
      query = query.eq("area", runnerArea)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar las consultas." }, { status: 500 })
  }

  const rows = ((data || []) as ConsultaRow[]).filter((row) => {
    return validSkuPattern.test(String(row.sku || "").trim().toUpperCase()) && Boolean(normalizeArea(row.area))
  })

  const skus = Array.from(new Set(rows.map((row) => String(row.sku).trim().toUpperCase())))
  const imageMap = new Map<string, string | null>()

  if (skus.length > 0) {
    const { data: products } = await supabase
      .from("sku_productos")
      .select("sku,imagen_url")
      .in("sku", skus)

    for (const product of products || []) {
      imageMap.set(String(product.sku).toUpperCase(), (product.imagen_url as string | null) || null)
    }
  }

  const rowsWithImages = rows.map((row) => ({
    ...row,
    imagen_url: imageMap.get(String(row.sku).trim().toUpperCase()) || null,
  }))

  const groups = groupConsultasBySku(rowsWithImages)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { count: answeredToday } = await supabase
    .from("consultas_sku")
    .select("id", { count: "exact", head: true })
    .eq("telefono_runner", runner.telefono)
    .in("estado", ["respondido", "no_disponible"])
    .gte("responded_at", today.toISOString())

  const { count: myTicketsCount } = await supabase
    .from("consultas_sku")
    .select("id", { count: "exact", head: true })
    .eq("telefono_runner", runner.telefono)
    .in("estado", ["tomada", "en_revision"])

  let availableAreas: string[] | undefined

  if (view === "available") {
    const { data: areaRows } = await supabase
      .from("consultas_sku")
      .select("area")
      .eq("estado", "pendiente_sin_asignar")
      .is("telefono_runner", null)
      .not("area", "is", null)

    availableAreas = Array.from(
      new Set(
        (areaRows || [])
          .map((row) => normalizeArea(row.area as string | null))
          .filter(Boolean) as string[],
      ),
    ).sort()
  }

  return NextResponse.json({
    runner,
    view,
    availableAreas,
    metrics: {
      pendingConsultas: view === "available" ? rows.length : 0,
      pendingSkus: view === "available" ? groups.length : 0,
      myTickets: myTicketsCount || (view === "mine" ? rows.length : 0),
      topSku: groups[0]?.sku || null,
      topSkuCount: groups[0]?.total || 0,
      answeredToday: answeredToday || 0,
    },
    groups,
    tickets: view === "mine" ? groups : undefined,
  })
}
