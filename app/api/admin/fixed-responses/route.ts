import { NextResponse } from "next/server"
import { listFixedResponses, updateFixedResponse } from "@/lib/fixed-responses"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"

export async function GET() {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const responses = await listFixedResponses(supabase, { onlyActive: true })
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
    const { id, activo, respuesta } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "ID requerido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const data = await updateFixedResponse(
      supabase,
      String(id),
      {
        activo: activo !== undefined ? Boolean(activo) : undefined,
        respuesta: respuesta !== undefined ? String(respuesta) : undefined,
      },
      {
        allowAnyRunner: true,
        desfijadoPor: activo === false ? admin.nombre || admin.telefono : undefined,
      },
    )

    if (activo !== undefined) {
      const isActive = Boolean(data.activo)
      const sku = String(data.sku || "").trim().toUpperCase()
      const { error: notifError } = await supabase.from("notificaciones_app").insert({
        tipo: "respuesta_fija_cambiada",
        titulo: `SKU ${sku} — ${isActive ? "Fijado sin stock" : "Stock repuesto"}`,
        cuerpo: isActive
          ? `El admin fijó "${sku}" como sin stock. Los pickers recibirán respuesta automática.`
          : `El admin confirmó llegada de "${sku}". La respuesta automática fue desactivada.`,
        rol_destino: "runner",
        referencia_tipo: "sku_respuesta",
        referencia_id: String(data.id),
        metadata: { sku, activo: isActive, admin: admin.nombre || admin.telefono },
        leida: false,
      })
      if (notifError) console.error("notificacion respuesta fija", notifError)
    }

    return NextResponse.json({ ok: true, response: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar la respuesta." },
      { status: 500 },
    )
  }
}
