import { NextResponse } from "next/server"
import { dispatchRunnerResponseUpdate } from "@/lib/n8n-dispatch"
import { isMineResponded } from "@/lib/mine-queries"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const { id } = await context.params
    const consultaId = String(id || "").trim()
    const { respuesta } = await request.json()
    const cleanAnswer = String(respuesta || "").trim()

    if (!consultaId || cleanAnswer.length < 2) {
      return NextResponse.json({ error: "Ingresa una respuesta valida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: consulta, error: selectError } = await supabase
      .from("consultas_sku")
      .select("id,sku,estado,telefono_runner,assigned_at,local_id")
      .eq("id", consultaId)
      .maybeSingle()

    if (selectError) throw selectError

    if (!consulta) {
      return NextResponse.json({ error: "Consulta no encontrada." }, { status: 404 })
    }

    if (consulta.telefono_runner !== runner.telefono) {
      return NextResponse.json({ error: "No tienes permiso para editar esta consulta." }, { status: 403 })
    }

    if (!isMineResponded(String(consulta.estado || ""))) {
      return NextResponse.json({ error: "Solo puedes editar consultas respondidas." }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from("consultas_sku")
      .update({
        respuesta_runner: cleanAnswer,
        whatsapp_enviado: false,
      })
      .eq("id", consultaId)

    if (updateError) throw updateError

    const dispatch = await dispatchRunnerResponseUpdate(consultaId, cleanAnswer, String(consulta.sku || ""))

    return NextResponse.json({
      ok: true,
      consultaId,
      whatsappOk: dispatch.ok,
      dispatch,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo actualizar la respuesta." }, { status: 500 })
  }
}
