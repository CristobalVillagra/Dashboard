import { NextResponse } from "next/server"
import { normalizeArea } from "@/lib/areas"
import { groupConsultasBySku, type ConsultaRow } from "@/lib/query-groups"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

const validSkuPattern = /^[A-Z0-9_-]{2,32}$/

type ProductInfo = {
  imagen_url: string | null
  nombre_producto: string | null
  marca_producto: string | null
}

export async function GET(request: Request) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const view = new URL(request.url).searchParams.get("view") || "available"
  const areaParam = new URL(request.url).searchParams.get("area")
  const supabase = getSupabaseAdmin()
  const runnerArea = normalizeArea(runner.area)
  const activeWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from("consultas_sku")
    .select(
      "id,sku,marca_producto,area,telefono_picker,picker_nombre,mensaje_original,estado,respuesta_runner,nombre_runner,created_at,assigned_at,responded_at,local_id,canal",
    )
    .gte("created_at", activeWindowStart)
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
        // Incluye consultas sin área (canal app sin área definida) y del área seleccionada
        query = query.or(`area.eq.${selectedArea},area.is.null`)
      }
    } else if (runnerArea) {
      // Incluye consultas sin área (canal app sin área definida) y del área del runner
      query = query.or(`area.eq.${runnerArea},area.is.null`)
    }
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar las consultas." }, { status: 500 })
  }

  const rows = ((data || []) as ConsultaRow[]).filter((row) => {
    // Permite consultas de canal 'app' aunque no tengan area asignada
    const hasValidSku = validSkuPattern.test(String(row.sku || "").trim().toUpperCase())
    const hasValidArea = Boolean(normalizeArea(row.area))
    const isAppChannel = row.canal === "app"
    return hasValidSku && (hasValidArea || isAppChannel)
  })

  const skus = Array.from(new Set(rows.map((row) => String(row.sku).trim().toUpperCase())))
  const productMap = new Map<string, ProductInfo>()

  if (skus.length > 0) {
    let productQuery = supabase
      .from("sku_productos")
      .select("sku,imagen_url,nombre_producto,marca_producto")
      .in("sku", skus)
      .eq("activo", true)

    if (runner.localId) {
      productQuery = productQuery.eq("local_id", runner.localId)
    }

    const { data: products, error: productsError } = await productQuery

    if (productsError) {
      console.error(productsError)
      return NextResponse.json({ error: "No se pudieron cargar los productos." }, { status: 500 })
    }

    for (const product of products || []) {
      productMap.set(String(product.sku).trim().toUpperCase(), {
        imagen_url: (product.imagen_url as string | null) || null,
        nombre_producto: (product.nombre_producto as string | null) || null,
        marca_producto: (product.marca_producto as string | null) || null,
      })
    }
  }

  const enrichedRows = rows.map((row) => {
    const skuKey = String(row.sku).trim().toUpperCase()
    const product = productMap.get(skuKey)

    return {
      ...row,
      imagen_url: product?.imagen_url ?? null,
      nombre_producto: product?.nombre_producto ?? null,
      marca_producto: product?.marca_producto ?? row.marca_producto ?? null,
    }
  })

  const groups = groupConsultasBySku(enrichedRows)
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
      .gte("created_at", activeWindowStart)
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
