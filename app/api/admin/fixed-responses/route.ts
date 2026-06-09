import { NextResponse } from "next/server"
import { listFixedResponses } from "@/lib/fixed-responses"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"

export async function GET() {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const responses = await listFixedResponses(supabase)
    return NextResponse.json({ responses })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar respuestas fijas." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { id, activo } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "ID requerido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("sku_respuestas")
      .update({ activo: Boolean(activo) })
      .eq("id", id)
      .select("id,sku,respuesta,activo,respuesta_fija")
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, response: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo actualizar la respuesta." }, { status: 500 })
  }
}
