import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"
import { normalizeArea } from "@/lib/areas"

export async function GET(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  const estado = new URL(request.url).searchParams.get("estado") || "pendiente_aprobacion"
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from("usuarios")
    .select("telefono,nombre,rol,area,estado_usuario,local_id,creado_en")
    .order("creado_en", { ascending: false })

  if (estado !== "all") {
    query = query.eq("estado_usuario", estado)
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar usuarios." }, { status: 500 })
  }

  return NextResponse.json({ users: data || [] })
}

export async function POST(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { telefono, nombre, rol, area, estadoUsuario } = await request.json()
    const cleanPhone = String(telefono || "").replace(/[^\d+]/g, "").trim()
    const cleanName = String(nombre || "").trim()
    const cleanRole: "runner" | "admin" | "picker" =
      rol === "admin" ? "admin" : rol === "picker" ? "picker" : "runner"
    const cleanArea = cleanRole === "runner" ? normalizeArea(area) : null
    const cleanState = estadoUsuario === "pendiente_aprobacion" ? "pendiente_aprobacion" : "activo"

    if (cleanPhone.length < 8 || cleanName.length < 2) {
      return NextResponse.json({ error: "Ingresa telefono y nombre validos." }, { status: 400 })
    }

    if (cleanRole === "runner" && !cleanArea) {
      return NextResponse.json({ error: "Debes asignar area al runner." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: local } = await supabase.from("locales").select("id").eq("codigo", "55").maybeSingle()

    const payload = {
      telefono: cleanPhone,
      nombre: cleanName,
      rol: cleanRole,
      area: cleanArea,
      estado_usuario: cleanState,
      local_id: local?.id || admin.localId || null,
    }

    const { data: existingUser, error: existingError } = await supabase
      .from("usuarios")
      .select("telefono")
      .eq("telefono", cleanPhone)
      .maybeSingle()

    if (existingError) throw existingError

    const mutation = existingUser
      ? supabase.from("usuarios").update(payload).eq("telefono", cleanPhone)
      : supabase.from("usuarios").insert({ ...payload, activo: false, creado_en: new Date().toISOString() })

    const { data, error } = await mutation
      .select("telefono,nombre,rol,area,estado_usuario,local_id")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, user: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { telefono, action, area, rol, estadoUsuario, nombre } = await request.json()
    const cleanPhone = String(telefono || "").trim()
    const cleanArea = area ? normalizeArea(area) : null

    if (!cleanPhone || !["aprobar", "rechazar", "activar", "inactivar", "editar"].includes(action)) {
      return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const updates: Record<string, string | boolean | null> = {}

    if (action === "aprobar") {
      // Verificar si es picker (no requiere area)
      const { data: targetUser } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("telefono", cleanPhone)
        .maybeSingle()

      const isPicker = targetUser?.rol === "picker"

      if (!isPicker && !cleanArea) {
        return NextResponse.json({ error: "Debes asignar un area al aprobar un runner." }, { status: 400 })
      }

      updates.estado_usuario = "activo"
      updates.area = isPicker ? null : cleanArea
      updates.activo = false
    } else if (action === "rechazar") {
      updates.estado_usuario = "rechazado"
      updates.activo = false
    } else if (action === "activar") {
      updates.estado_usuario = "activo"
      if (cleanArea) updates.area = cleanArea
    } else if (action === "inactivar") {
      updates.estado_usuario = "inactivo"
      updates.activo = false
    } else if (action === "editar") {
      const cleanRole: "runner" | "admin" | "picker" =
        rol === "admin" ? "admin" : rol === "picker" ? "picker" : "runner"
      const cleanState = ["pendiente_aprobacion", "activo", "inactivo", "rechazado"].includes(estadoUsuario)
        ? estadoUsuario
        : null

      if (!cleanState) {
        return NextResponse.json({ error: "Estado invalido." }, { status: 400 })
      }

      if (cleanRole === "runner" && !cleanArea) {
        return NextResponse.json({ error: "Debes asignar area al runner." }, { status: 400 })
      }
      // Los pickers no requieren area

      updates.rol = cleanRole
      updates.area = cleanRole === "runner" ? cleanArea : null
      updates.estado_usuario = cleanState
      if (cleanState !== "activo") updates.activo = false
      if (nombre !== undefined) updates.nombre = String(nombre || "").trim()
    }

    const { data, error } = await supabase
      .from("usuarios")
      .update(updates)
      .eq("telefono", cleanPhone)
      .select("telefono,nombre,rol,area,estado_usuario")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, user: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo actualizar el usuario." }, { status: 500 })
  }
}
