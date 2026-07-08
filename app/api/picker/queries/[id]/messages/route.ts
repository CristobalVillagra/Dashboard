import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActivePicker } from "@/lib/runner-auth"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { picker, reason } = await requireActivePicker()

  if (!picker) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const { id } = await params
  const consultaId = Number(id)

  if (!consultaId || isNaN(consultaId)) {
    return NextResponse.json({ error: "Consulta invalida." }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Verificar que la consulta pertenece a este picker
  const { data: consulta, error: consultaError } = await supabase
    .from("consultas_sku")
    .select("id, telefono_picker")
    .eq("id", consultaId)
    .eq("telefono_picker", picker.telefono)
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
    console.error("messages GET error", error)
    return NextResponse.json({ error: "No se pudieron cargar los mensajes." }, { status: 500 })
  }

  // Marcar como leida si habia mensajes no leidos de runner
  await supabase
    .from("consulta_sku_mensajes")
    .update({ leido: true })
    .eq("consulta_id", consultaId)
    .eq("leido", false)
    .neq("rol_emisor", "picker")

  // Marcar consulta como leida por picker
  await supabase
    .from("consultas_sku")
    .update({ leida_picker: true })
    .eq("id", consultaId)
    .eq("telefono_picker", picker.telefono)

  return NextResponse.json({ messages: messages || [] })
}
