import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const { id } = await params
  const consultaId = Number(id)

  if (!consultaId || isNaN(consultaId)) {
    return NextResponse.json({ error: "Consulta invalida." }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verificar que la consulta es del área del runner o fue tomada por él
  const { data: consulta, error: consultaError } = await supabase
    .from("consultas_sku")
    .select("id, telefono_runner, area")
    .eq("id", consultaId)
    .maybeSingle()

  if (consultaError || !consulta) {
    return NextResponse.json({ error: "Consulta no encontrada." }, { status: 404 })
  }

  const { data: messages, error } = await supabase
    .from("consulta_sku_mensajes")
    .select("id, rol_emisor, nombre, contenido, leido, created_at")
    .eq("consulta_id", consultaId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("runner messages GET error", error)
    return NextResponse.json({ error: "No se pudieron cargar los mensajes." }, { status: 500 })
  }

  return NextResponse.json({ messages: messages || [] })
}
