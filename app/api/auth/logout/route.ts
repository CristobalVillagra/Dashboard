import { NextResponse } from "next/server"
import { clearRunnerCookie, readRunnerSession } from "@/lib/runner-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function POST() {
  const session = await readRunnerSession()

  if (session) {
    const supabase = getSupabaseAdmin()
    await supabase.from("usuarios").update({ activo: false }).eq("telefono", session.telefono)
  }

  await clearRunnerCookie()
  return NextResponse.json({ ok: true })
}
