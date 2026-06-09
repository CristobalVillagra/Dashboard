import { NextResponse } from "next/server"
import { listFixedResponses } from "@/lib/fixed-responses"
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
    return NextResponse.json({ responses })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar respuestas fijas." }, { status: 500 })
  }
}
