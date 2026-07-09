import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin, requireActiveRunner } from "@/lib/runner-auth"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { runner } = await requireActiveRunner({ touch: false })
  const { admin } = runner ? { admin: null } : await requireActiveAdmin({ touch: false })

  if (!runner && !admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 })
  }

  const { id } = await params
  const consultaId = Number(id)

  if (!consultaId || isNaN(consultaId)) {
    return NextResponse.json({ error: "Consulta invalida." }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const { data: consulta, error: consultaError } = await supabase
    .from("consultas_sku")
    .select(
      "id, telefono_runner, area, mensaje_original, picker_nombre, telefono_picker, respuesta_runner, created_at, responded_at",
    )
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

  let result = messages || []

  const hasPicker = result.some((m) => m.rol_emisor === "picker")
  if (!hasPicker && consulta.mensaje_original) {
    result = [
      {
        id: 0,
        rol_emisor: "picker",
        nombre: consulta.picker_nombre || consulta.telefono_picker,
        contenido: consulta.mensaje_original,
        leido: true,
        created_at: consulta.created_at || new Date().toISOString(),
      },
      ...result,
    ]
  }

  const hasRunner = result.some((m) => m.rol_emisor === "runner")
  if (!hasRunner && consulta.respuesta_runner) {
    result = [
      ...result,
      {
        id: -1,
        rol_emisor: "runner",
        nombre: null,
        contenido: consulta.respuesta_runner,
        leido: true,
        created_at: consulta.responded_at || consulta.created_at || new Date().toISOString(),
      },
    ]
  }

  return NextResponse.json({ messages: result })
}
