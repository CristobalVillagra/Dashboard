import type { SupabaseClient } from "@supabase/supabase-js"
import { insightFromProductRow, isStaleNoDisponibleReport } from "@/lib/product-insights"

export type FixedResponseRecord = {
  id: string
  sku: string
  respuesta: string
  activo: boolean
  respuesta_fija: boolean
  telefono_runner: string | null
  nombre_runner: string | null
  area: string | null
  marca_producto: string | null
  estado_respuesta: string | null
  ultima_respuesta_en: string | null
  expires_at: string | null
  imagen_url: string | null
  nombre_producto?: string | null
  reportes_no_disponible?: number | null
  ultimo_estado_reportado?: string | null
  ultimo_reporte_no_disponible?: string | null
  reporte_stale?: boolean
  reporte_multiples_runners?: boolean
  runners_reportando?: number
}

export async function listFixedResponses(
  supabase: SupabaseClient,
  options?: {
    area?: string | null
    runnerTelefono?: string | null
    onlyActive?: boolean
  },
) {
  let query = supabase
    .from("sku_respuestas")
    .select(
      "id,sku,respuesta,estado_respuesta,respuesta_fija,activo,telefono_runner,nombre_runner,ultima_respuesta_en,expires_at,area,marca_producto",
    )
    .eq("respuesta_fija", true)
    .order("ultima_respuesta_en", { ascending: false })
    .limit(200)

  if (options?.onlyActive) {
    query = query.eq("activo", true)
  }

  if (options?.runnerTelefono) {
    query = query.eq("telefono_runner", options.runnerTelefono)
  }

  if (options?.area) {
    query = query.eq("area", options.area)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = data || []
  const skus = Array.from(new Set(rows.map((row) => String(row.sku).trim().toUpperCase())))
  const productMap = new Map<
    string,
    {
      imagen_url: string | null
      nombre_producto: string | null
      reportes_no_disponible: number | null
      ultimo_estado_reportado: string | null
      ultimo_reporte_no_disponible: string | null
    }
  >()
  const runnerCountMap = new Map<string, number>()

  if (skus.length > 0) {
    const { data: products } = await supabase
      .from("sku_productos")
      .select(
        "sku,imagen_url,nombre_producto,reportes_no_disponible,ultimo_estado_reportado,ultimo_reporte_no_disponible",
      )
      .in("sku", skus)

    for (const product of products || []) {
      productMap.set(String(product.sku).trim().toUpperCase(), {
        imagen_url: (product.imagen_url as string | null) || null,
        nombre_producto: (product.nombre_producto as string | null) || null,
        reportes_no_disponible: Number(product.reportes_no_disponible || 0),
        ultimo_estado_reportado: (product.ultimo_estado_reportado as string | null) || null,
        ultimo_reporte_no_disponible: (product.ultimo_reporte_no_disponible as string | null) || null,
      })
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: reportRows } = await supabase
      .from("consultas_sku")
      .select("sku,telefono_runner")
      .in("sku", skus)
      .eq("estado_respuesta", "no_disponible")
      .gte("responded_at", sevenDaysAgo)

    const temp = new Map<string, Set<string>>()
    for (const row of reportRows || []) {
      const sku = String(row.sku).trim().toUpperCase()
      const runner = String(row.telefono_runner || "").trim()
      if (!sku || !runner) continue
      temp.set(sku, temp.get(sku) || new Set<string>())
      temp.get(sku)!.add(runner)
    }
    for (const [sku, runners] of temp.entries()) {
      runnerCountMap.set(sku, runners.size)
    }
  }

  return rows.map((row) => {
    const skuKey = String(row.sku).trim().toUpperCase()
    const product = productMap.get(skuKey)
    const runnersReportando = runnerCountMap.get(skuKey) || 0

    return {
      ...(row as Omit<
        FixedResponseRecord,
        | "imagen_url"
        | "nombre_producto"
        | "reportes_no_disponible"
        | "ultimo_estado_reportado"
        | "ultimo_reporte_no_disponible"
        | "reporte_stale"
        | "reporte_multiples_runners"
        | "runners_reportando"
      >),
      imagen_url: product?.imagen_url || null,
      nombre_producto: product?.nombre_producto || null,
      reportes_no_disponible: product?.reportes_no_disponible ?? null,
      ultimo_estado_reportado: product?.ultimo_estado_reportado ?? null,
      ultimo_reporte_no_disponible: product?.ultimo_reporte_no_disponible ?? null,
      reporte_stale: isStaleNoDisponibleReport(
        product?.ultimo_estado_reportado,
        product?.ultimo_reporte_no_disponible,
      ),
      reporte_multiples_runners: runnersReportando > 1,
      runners_reportando: runnersReportando,
    }
  }) satisfies FixedResponseRecord[]
}

export async function updateFixedResponse(
  supabase: SupabaseClient,
  id: string,
  updates: { activo?: boolean; respuesta?: string },
  options?: { runnerTelefono?: string | null; allowAnyRunner?: boolean },
) {
  let query = supabase.from("sku_respuestas").select("id,telefono_runner,respuesta_fija").eq("id", id)

  const { data: existing, error: selectError } = await query.maybeSingle()
  if (selectError) throw selectError
  if (!existing) throw new Error("Respuesta fija no encontrada.")
  if (!existing.respuesta_fija) throw new Error("Solo se pueden editar respuestas fijas.")

  if (!options?.allowAnyRunner && options?.runnerTelefono) {
    if (existing.telefono_runner !== options.runnerTelefono) {
      throw new Error("No tienes permiso para editar esta respuesta fija.")
    }
  }

  const payload: Record<string, string | boolean> = {}
  if (updates.activo !== undefined) {
    payload.activo = Boolean(updates.activo)
    if (!updates.activo) payload.respuesta_fija = false
  }
  if (updates.respuesta !== undefined) {
    const clean = String(updates.respuesta || "").trim()
    if (clean.length < 2) throw new Error("La respuesta debe tener al menos 2 caracteres.")
    payload.respuesta = clean
    payload.ultima_respuesta_en = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from("sku_respuestas")
    .update(payload)
    .eq("id", id)
    .select(
      "id,sku,respuesta,estado_respuesta,respuesta_fija,activo,telefono_runner,nombre_runner,ultima_respuesta_en,expires_at,area,marca_producto",
    )
    .single()

  if (error) throw error
  return data
}

export { insightFromProductRow }
