import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"

export async function GET() {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("consultas_sku")
    .select(
      "id,sku,marca_producto,area,telefono_picker,estado,estado_respuesta,respuesta_runner,nombre_runner,responded_at,created_at,respuesta_fija",
    )
    .in("estado", ["respondido", "no_disponible", "en_revision"])
    .order("responded_at", { ascending: false })
    .limit(200)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar consultas." }, { status: 500 })
  }

  return NextResponse.json({ queries: data || [] })
}

export async function PATCH(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { id, respuesta, estado } = await request.json()
    const consultaId = String(id || "").trim()
    const cleanAnswer = String(respuesta || "").trim()

    if (!consultaId || cleanAnswer.length < 2) {
      return NextResponse.json({ error: "Datos invalidos." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const updates: Record<string, string> = {
      respuesta_runner: cleanAnswer,
    }

    if (estado && ["respondido", "no_disponible", "en_revision"].includes(estado)) {
      updates.estado = estado
    }

    const { data, error } = await supabase
      .from("consultas_sku")
      .update(updates)
      .eq("id", consultaId)
      .select("id,sku,estado,respuesta_runner,responded_at")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, query: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo actualizar la consulta." }, { status: 500 })
  }
}
