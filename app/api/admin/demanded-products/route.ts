import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"

function normalizeDays(value: string | null) {
  const days = Number(value || 1)
  if (days === 7 || days === 30) return days
  return 1
}

export async function GET(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  const days = normalizeDays(new URL(request.url).searchParams.get("days"))
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc("productos_mas_demandados", {
    dias: days,
  })

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudieron cargar productos demandados." }, { status: 500 })
  }

  return NextResponse.json({ days, products: data || [] })
}
