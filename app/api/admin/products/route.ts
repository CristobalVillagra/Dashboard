import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"
import { normalizeArea } from "@/lib/areas"

const imageBucket = "product-images"
const maxImageSize = 6 * 1024 * 1024
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"])

function validSku(sku: string) {
  return /^[A-Z0-9_-]{2,32}$/.test(sku)
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

  return NextResponse.json({ products: data || [] })
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
    const { sku, nombreProducto, marcaProducto, area, imagenUrl, imagen, activo } = await parseProductPayload(request)
    const cleanSku = String(sku || "").trim().toUpperCase()

    if (!validSku(cleanSku)) {
      return NextResponse.json({ error: "SKU requerido o invalido." }, { status: 400 })
    }

    const uploadedImageUrl = imagen instanceof File && imagen.size > 0 ? await uploadProductImage(imagen, cleanSku) : null

    const updates: Record<string, string | boolean | null> = {
      updated_at: new Date().toISOString(),
    }

    if (nombreProducto !== undefined) updates.nombre_producto = String(nombreProducto || "").trim() || null
    if (marcaProducto !== undefined) updates.marca_producto = String(marcaProducto || "").trim() || null
    if (area !== undefined) updates.area = normalizeArea(area)
    if (uploadedImageUrl || imagenUrl !== undefined) updates.imagen_url = uploadedImageUrl || String(imagenUrl || "").trim() || null
    if (activo !== undefined) updates.activo = activo === true || activo === "true"

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sku_productos")
      .update(updates)
      .eq("sku", cleanSku)
      .select("sku,nombre_producto,marca_producto,area,imagen_url,activo")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, product: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el producto." },
      { status: 500 },
    )
  }
}
