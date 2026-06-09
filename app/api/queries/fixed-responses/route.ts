import { NextResponse } from "next/server"
import { listFixedResponses, updateFixedResponse } from "@/lib/fixed-responses"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveRunner } from "@/lib/runner-auth"

export async function GET() {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const responses = await listFixedResponses(supabase)
    return NextResponse.json({ responses, runnerTelefono: runner.telefono })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar respuestas fijas." }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { runner, reason } = await requireActiveRunner()

  if (!runner) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
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
      { runnerTelefono: runner.telefono },
    )

    return NextResponse.json({ ok: true, response: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar la respuesta." },
      { status: error instanceof Error && error.message.includes("permiso") ? 403 : 500 },
    )
  }
}
