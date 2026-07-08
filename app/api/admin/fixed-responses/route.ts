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
      { allowAnyRunner: true },
    )

    return NextResponse.json({ ok: true, response: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar la respuesta." },
      { status: 500 },
    )
  }
}
