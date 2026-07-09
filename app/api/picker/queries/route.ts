import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActivePicker } from "@/lib/runner-auth"

const ACTIVE_ESTADOS  = ["pendiente_sin_asignar", "tomada", "en_revision"]
const RESOLVED_ESTADOS = ["respondido", "no_disponible", "cancelada"]
const TURNO_HOURS = 14

export async function GET(request: Request) {
  const { picker, reason } = await requireActivePicker()

  if (!picker) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "active"

  const supabase = getSupabaseAdmin()
  const estados = status === "active" ? ACTIVE_ESTADOS : RESOLVED_ESTADOS

  let baseQuery = supabase
    .from("consultas_sku")
    .select("id, sku, marca_producto, area, estado, estado_respuesta, respuesta_runner, nombre_runner, telefono_runner, mensaje_original, created_at, responded_at, leida_picker, canal")
    .eq("telefono_picker", picker.telefono)
    .in("estado", estados)
    .order("created_at", { ascending: false })

  if (status === "resolved") {
    const cutoff = new Date(Date.now() - TURNO_HOURS * 60 * 60 * 1000).toISOString()
    baseQuery = baseQuery.gt("created_at", cutoff)
  }

  const { data, error } = await baseQuery

  if (error) {
    console.error("picker queries GET error", error)
    return NextResponse.json({ error: "No se pudieron cargar las consultas." }, { status: 500 })
  }

  // Enrich with product info
  const skus = [...new Set((data || []).map((r) => r.sku))]
  const { data: productsData } = skus.length
    ? await supabase
        .from("sku_productos")
        .select("sku, nombre_producto, imagen_url")
        .in("sku", skus)
    : { data: [] }

  const productMap = new Map((productsData || []).map((p) => [p.sku, p]))

  const consultas = (data || []).map((row) => {
    const prod = productMap.get(row.sku)
    return {
      id: row.id,
      sku: row.sku,
      marca_producto: row.marca_producto,
      area: row.area,
      estado: row.estado,
      estado_respuesta: row.estado_respuesta,
      respuesta_runner: row.respuesta_runner,
      nombre_runner: row.nombre_runner,
      telefono_runner: row.telefono_runner,
      mensaje_original: row.mensaje_original,
      created_at: row.created_at,
      responded_at: row.responded_at,
      leida_picker: row.leida_picker ?? false,
      canal: row.canal ?? "whatsapp",
      nombre_producto: prod?.nombre_producto || null,
      imagen_url: prod?.imagen_url || null,
    }
  })

  return NextResponse.json({ consultas })
}

export async function POST(request: Request) {
  const { picker, reason } = await requireActivePicker()

  if (!picker) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const { sku, mensaje } = await request.json()
    const cleanSku = String(sku || "").trim().toUpperCase()

    if (!cleanSku || cleanSku.length < 2) {
      return NextResponse.json({ error: "SKU invalido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Obtener datos del producto para enriquecer la consulta
    const { data: product } = await supabase
      .from("sku_productos")
      .select("marca_producto, area, nombre_producto")
      .eq("sku", cleanSku)
      .maybeSingle()

    // ── Respuesta automática: verificar si el SKU tiene respuesta activa de no_disponible ──
    const now = new Date().toISOString()
    const { data: fixedResp } = await supabase
      .from("sku_respuestas")
      .select("respuesta, nombre_runner, telefono_runner")
      .eq("sku", cleanSku)
      .eq("activo", true)
      .eq("estado_respuesta", "no_disponible")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .limit(1)
      .maybeSingle()

    if (fixedResp) {
      // Registrar la consulta ya respondida automáticamente
      const autoMensaje = mensaje || `Consulta: ${cleanSku}`
      const { data: autoData, error: autoError } = await supabase
        .from("consultas_sku")
        .insert({
          sku:             cleanSku,
          marca_producto:  product?.marca_producto || null,
          area:            product?.area || null,
          telefono_picker: picker.telefono,
          picker_nombre:   picker.nombre,
          mensaje_original: autoMensaje,
          estado:          "no_disponible",
          estado_respuesta: "no_disponible",
          respuesta_runner: fixedResp.respuesta,
          nombre_runner:   fixedResp.nombre_runner || "Sistema",
          telefono_runner:  fixedResp.telefono_runner || "",
          canal:           "app",
          instancia:       "app",
          whatsapp_enviado: true,
          app_notificado:  true,
          leida_picker:    false,
          responded_at:    now,
          local_id:        picker.localId || null,
        })
        .select("id, sku, estado")
        .single()

      if (!autoError && autoData) {
        await supabase.from("consulta_sku_mensajes").insert([
          {
            consulta_id: autoData.id,
            autor_rol: "picker",
            autor_nombre: picker.nombre,
            mensaje: autoMensaje,
            rol_emisor: "picker",
            telefono: picker.telefono,
            nombre: picker.nombre,
            contenido: autoMensaje,
          },
          {
            consulta_id: autoData.id,
            autor_rol: "system",
            autor_nombre: "Respuesta automática",
            mensaje: fixedResp.respuesta,
            rol_emisor: "sistema",
            telefono: fixedResp.telefono_runner || "",
            nombre: fixedResp.nombre_runner || "Sistema",
            contenido: fixedResp.respuesta,
          },
          {
            consulta_id: autoData.id,
            autor_rol: "runner",
            autor_nombre: fixedResp.nombre_runner || "Sistema",
            mensaje: fixedResp.respuesta,
            rol_emisor: "runner",
            telefono: fixedResp.telefono_runner || "",
            nombre: fixedResp.nombre_runner || "Sistema",
            contenido: fixedResp.respuesta,
          },
        ])
      }

      return NextResponse.json({
        ok: true,
        autoResponse: true,
        consulta: autoData
          ? { consulta_id: autoData.id, sku: autoData.sku, estado: autoData.estado }
          : null,
        message: `Producto no disponible: ${fixedResp.respuesta}`,
      }, { status: 201 })
    }

    // ── Sin respuesta fija: crear ticket normal para runner ──
    const { data, error } = await supabase.rpc("create_picker_product_query", {
      p_telefono_picker: picker.telefono,
      p_nombre_picker:   picker.nombre,
      p_sku:             cleanSku,
      p_area:            product?.area || null,
      p_marca_producto:  product?.marca_producto || null,
      p_mensaje:         mensaje || null,
      p_local_id:        picker.localId || null,
    })

    if (error) {
      console.error("create_picker_product_query error", error)
      if (error.code === "PGRST202" || String(error.message).includes("schema cache")) {
        return NextResponse.json(
          { error: "La base de datos necesita actualizarse. Ejecuta la migración 008_picker_internal_app.sql en Supabase." },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: "No se pudo crear la consulta." }, { status: 500 })
    }

    const result = Array.isArray(data) ? data[0] : data

    return NextResponse.json({ ok: true, consulta: result }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo crear la consulta." }, { status: 500 })
  }
}
