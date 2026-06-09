import type { SupabaseClient } from "@supabase/supabase-js"

export async function renameProductSku(
  supabase: SupabaseClient,
  oldSku: string,
  newSku: string,
) {
  const cleanOld = oldSku.trim().toUpperCase()
  const cleanNew = newSku.trim().toUpperCase()

  if (cleanOld === cleanNew) {
    return { ok: true, sku: cleanNew, renamed: false }
  }

  const { data: existingNew, error: existsError } = await supabase
    .from("sku_productos")
    .select("sku")
    .eq("sku", cleanNew)
    .maybeSingle()

  if (existsError) throw existsError
  if (existingNew) {
    throw new Error(`El SKU ${cleanNew} ya existe en el catalogo.`)
  }

  const { data: product, error: productError } = await supabase
    .from("sku_productos")
    .select(
      "nombre_producto,marca_producto,area,activo,imagen_url,local_id,reportes_no_disponible,ultimo_reporte_no_disponible,ultimo_estado_reportado,created_at",
    )
    .eq("sku", cleanOld)
    .single()

  if (productError || !product) {
    throw new Error("Producto no encontrado.")
  }

  const now = new Date().toISOString()

  const { error: insertError } = await supabase.from("sku_productos").insert({
    sku: cleanNew,
    nombre_producto: product.nombre_producto,
    marca_producto: product.marca_producto,
    area: product.area,
    activo: product.activo,
    imagen_url: product.imagen_url,
    local_id: product.local_id,
    reportes_no_disponible: product.reportes_no_disponible,
    ultimo_reporte_no_disponible: product.ultimo_reporte_no_disponible,
    ultimo_estado_reportado: product.ultimo_estado_reportado,
    created_at: product.created_at || now,
    updated_at: now,
  })

  if (insertError) throw insertError

  const { error: respuestasError } = await supabase
    .from("sku_respuestas")
    .update({ sku: cleanNew })
    .eq("sku", cleanOld)

  if (respuestasError) throw respuestasError

  const { error: consultasError } = await supabase
    .from("consultas_sku")
    .update({ sku: cleanNew })
    .eq("sku", cleanOld)

  if (consultasError) throw consultasError

  const { error: deleteError } = await supabase.from("sku_productos").delete().eq("sku", cleanOld)

  if (deleteError) throw deleteError

  return { ok: true, sku: cleanNew, renamed: true, oldSku: cleanOld }
}
