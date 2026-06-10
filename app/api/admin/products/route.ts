import { NextResponse } from "next/server"
import { insightFromProductRow } from "@/lib/fixed-responses"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"
import { renameProductSku } from "@/lib/product-sku"
import { normalizeArea } from "@/lib/areas"

const imageBucket = "product-images"
const maxImageSize = 6 * 1024 * 1024
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"])

function validSku(sku: string) {
  return /^[A-Z0-9_-]{2,32}$/.test(sku)
}

async function syncOpenConsultasForProduct(
  sku: string,
  updates: { marca_producto?: string | null; area?: string | null },
) {
  const cleanSku = String(sku || "").trim().toUpperCase()
  if (!validSku(cleanSku)) return

  const payload: Record<string, string | null> = {}
  if ("marca_producto" in updates) payload.marca_producto = updates.marca_producto ?? null
  if ("area" in updates) payload.area = normalizeArea(updates.area) ?? null
  if (Object.keys(payload).length === 0) return

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from("consultas_sku")
    .update(payload)
    .eq("sku", cleanSku)
    .in("estado", ["pendiente_sin_asignar", "tomada", "en_revision"])

  if (error) {
    console.warn("No se pudieron sincronizar consultas abiertas para producto", cleanSku, error)
  }
}

async function uploadProductImage(file: File, sku: string) {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error("Formato de foto invalido. Usa JPG, PNG, WebP, AVIF o foto de iPhone/Android.")
  }

  if (file.size > maxImageSize) {
    throw new Error("La foto no puede superar 6MB.")
  }

  const supabase = getSupabaseAdmin()
  await supabase.storage.createBucket(imageBucket, {
    public: true,
    fileSizeLimit: maxImageSize,
    allowedMimeTypes: Array.from(allowedImageTypes),
  }).catch(() => undefined)

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
  const path = `${sku}/${Date.now()}.${extension}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(imageBucket).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  })

  if (error) throw error

  const { data } = supabase.storage.from(imageBucket).getPublicUrl(path)
  return data.publicUrl
}

async function parseProductPayload(request: Request) {
  const contentType = request.headers.get("content-type") || ""

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData()
    const sku = String(form.get("sku") || "").trim().toUpperCase()
    return {
      sku,
      newSku: String(form.get("newSku") || "").trim().toUpperCase(),
      nombreProducto: String(form.get("nombreProducto") || "").trim(),
      marcaProducto: String(form.get("marcaProducto") || "").trim(),
      area: String(form.get("area") || "").trim(),
      imagenUrl: String(form.get("imagenUrl") || "").trim(),
      imagen: form.get("imagen"),
      activo: form.get("activo"),
    }
  }

  return request.json()
}

export async function GET() {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("sku_productos")
    .select("sku,nombre_producto,marca_producto,area,imagen_url,activo,local_id,reportes_no_disponible,ultimo_reporte_no_disponible,ultimo_estado_reportado,updated_at")
    .order("updated_at", { ascending: false })
    .limit(500)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo cargar el catalogo." }, { status: 500 })
  }

  const products = data || []
  const skus = products.map((p) => String(p.sku).trim().toUpperCase())
  const registeredSkus = new Set(skus)

  const fixedMap = new Map<string, { respuesta: string; activo: boolean | null; nombre_runner: string | null; estado_respuesta: string | null }>()
  const runnerCountMap = new Map<string, number>()

  if (skus.length > 0) {
    const { data: fixedRows } = await supabase
      .from("sku_respuestas")
      .select("sku,respuesta,activo,nombre_runner,estado_respuesta")
      .in("sku", skus)
      .eq("respuesta_fija", true)
      .eq("activo", true)

    for (const row of fixedRows || []) {
      fixedMap.set(String(row.sku).trim().toUpperCase(), {
        respuesta: String(row.respuesta || ""),
        activo: row.activo as boolean | null,
        nombre_runner: (row.nombre_runner as string | null) || null,
        estado_respuesta: (row.estado_respuesta as string | null) || null,
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

  const enriched = products.map((product) => {
    const skuKey = String(product.sku).trim().toUpperCase()
    const insight = insightFromProductRow(
      product,
      fixedMap.get(skuKey),
      runnerCountMap.get(skuKey) || 0,
    )
    return { ...product, ...insight, no_registrado: false, consultas_abiertas: 0 }
  })

  const { data: openConsultas } = await supabase
    .from("consultas_sku")
    .select("sku,marca_producto,area,created_at")
    .in("estado", ["pendiente_sin_asignar", "tomada", "en_revision"])
    .order("created_at", { ascending: false })
    .limit(1000)

  const unregisteredMap = new Map<string, {
    sku: string
    marca_producto: string | null
    area: string | null
    consultas_abiertas: number
    updated_at: string | null
  }>()

  for (const consulta of openConsultas || []) {
    const skuKey = String(consulta.sku || "").trim().toUpperCase()
    if (!validSku(skuKey) || registeredSkus.has(skuKey)) continue

    const current = unregisteredMap.get(skuKey)
    unregisteredMap.set(skuKey, {
      sku: skuKey,
      marca_producto: current?.marca_producto || (consulta.marca_producto as string | null) || null,
      area: current?.area || normalizeArea(consulta.area as string | null),
      consultas_abiertas: (current?.consultas_abiertas || 0) + 1,
      updated_at: current?.updated_at || (consulta.created_at as string | null) || null,
    })
  }

  for (const product of unregisteredMap.values()) {
    enriched.push({
      sku: product.sku,
      nombre_producto: null,
      marca_producto: product.marca_producto,
      area: product.area,
      imagen_url: null,
      activo: true,
      local_id: admin.localId,
      reportes_no_disponible: 0,
      ultimo_reporte_no_disponible: null,
      ultimo_estado_reportado: null,
      fixed_respuesta: null,
      fixed_activo: null,
      fixed_runner: null,
      fixed_estado: null,
      runners_reportando: 0,
      reporte_stale: false,
      reporte_multiples_runners: false,
      updated_at: product.updated_at,
      no_registrado: true,
      consultas_abiertas: product.consultas_abiertas,
    })
  }

  return NextResponse.json({ products: enriched })
}

export async function POST(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { sku, nombreProducto, marcaProducto, area, imagenUrl, imagen } = await parseProductPayload(request)
    const cleanSku = String(sku || "").trim().toUpperCase()
    const cleanArea = normalizeArea(area)

    if (!validSku(cleanSku)) {
      return NextResponse.json({ error: "SKU requerido o invalido." }, { status: 400 })
    }

    const uploadedImageUrl = imagen instanceof File && imagen.size > 0 ? await uploadProductImage(imagen, cleanSku) : null

    const supabase = getSupabaseAdmin()
    const { data: local } = await supabase.from("locales").select("id").eq("codigo", "55").maybeSingle()

    const { data, error } = await supabase
      .from("sku_productos")
      .upsert({
        sku: cleanSku,
        nombre_producto: String(nombreProducto || "").trim() || null,
        marca_producto: String(marcaProducto || "").trim() || null,
        area: cleanArea,
        imagen_url: uploadedImageUrl || String(imagenUrl || "").trim() || null,
        activo: true,
        local_id: local?.id || null,
        updated_at: new Date().toISOString(),
      })
      .select("sku,nombre_producto,marca_producto,area,imagen_url,activo")
      .single()

    if (error) throw error

    await syncOpenConsultasForProduct(cleanSku, {
      marca_producto: String(marcaProducto || "").trim() || null,
      area: cleanArea,
    })

    return NextResponse.json({ ok: true, product: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el producto." },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { sku, newSku, nombreProducto, marcaProducto, area, imagenUrl, imagen, activo } =
      await parseProductPayload(request)
    const cleanSku = String(sku || "").trim().toUpperCase()
    const cleanNewSku = String(newSku || "").trim().toUpperCase()

    if (!validSku(cleanSku)) {
      return NextResponse.json({ error: "SKU requerido o invalido." }, { status: 400 })
    }

    if (cleanNewSku && !validSku(cleanNewSku)) {
      return NextResponse.json({ error: "Nuevo SKU invalido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    if (cleanNewSku && cleanNewSku !== cleanSku) {
      await renameProductSku(supabase, cleanSku, cleanNewSku)
    }

    const targetSku = cleanNewSku && cleanNewSku !== cleanSku ? cleanNewSku : cleanSku
    const uploadedImageUrl =
      imagen instanceof File && imagen.size > 0 ? await uploadProductImage(imagen, targetSku) : null

    const updates: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    }

    if (nombreProducto !== undefined) updates.nombre_producto = String(nombreProducto || "").trim() || null
    if (marcaProducto !== undefined) updates.marca_producto = String(marcaProducto || "").trim() || null
    if (area !== undefined) updates.area = normalizeArea(area)
    if (uploadedImageUrl || imagenUrl !== undefined) {
      updates.imagen_url = uploadedImageUrl || String(imagenUrl || "").trim() || null
    }
    if (activo !== undefined) updates.activo = activo === true || activo === "true"

    const { data, error } = await supabase
      .from("sku_productos")
      .update(updates)
      .eq("sku", targetSku)
      .select("sku,nombre_producto,marca_producto,area,imagen_url,activo")
      .single()

    if (error) throw error

    await syncOpenConsultasForProduct(targetSku, {
      marca_producto:
        marcaProducto !== undefined ? String(marcaProducto || "").trim() || null : undefined,
      area: area !== undefined ? normalizeArea(area) : undefined,
    })

    return NextResponse.json({ ok: true, product: data, renamed: targetSku !== cleanSku, oldSku: cleanSku })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el producto." },
      { status: 500 },
    )
  }
}
