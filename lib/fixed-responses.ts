import type { SupabaseClient } from "@supabase/supabase-js"

export type FixedResponseRecord = {
  id: string
  sku: string
  respuesta: string
  activo: boolean
  respuesta_fija: boolean
  nombre_runner: string | null
  area: string | null
  marca_producto: string | null
  estado_respuesta: string | null
  ultima_respuesta_en: string | null
  expires_at: string | null
  imagen_url: string | null
}

export async function listFixedResponses(
  supabase: SupabaseClient,
  options?: { area?: string | null },
) {
  let query = supabase
    .from("sku_respuestas")
    .select(
      "id,sku,respuesta,estado_respuesta,respuesta_fija,activo,nombre_runner,ultima_respuesta_en,expires_at,area,marca_producto",
    )
    .eq("respuesta_fija", true)
    .order("ultima_respuesta_en", { ascending: false })
    .limit(200)

  if (options?.area) {
    query = query.eq("area", options.area)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = data || []
  const skus = Array.from(new Set(rows.map((row) => String(row.sku).trim().toUpperCase())))
  const imageMap = new Map<string, string | null>()

  if (skus.length > 0) {
    const { data: products } = await supabase.from("sku_productos").select("sku,imagen_url").in("sku", skus)

    for (const product of products || []) {
      imageMap.set(String(product.sku).trim().toUpperCase(), (product.imagen_url as string | null) || null)
    }
  }

  return rows.map((row) => ({
    ...(row as Omit<FixedResponseRecord, "imagen_url">),
    imagen_url: imageMap.get(String(row.sku).trim().toUpperCase()) || null,
  })) satisfies FixedResponseRecord[]
}
