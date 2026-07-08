import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActivePicker } from "@/lib/runner-auth"

export async function GET(request: Request) {
  const { picker, reason } = await requireActivePicker()

  if (!picker) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  const url = new URL(request.url)
  const query = url.searchParams.get("query") || ""
  const area  = url.searchParams.get("area")  || ""
  const marca = url.searchParams.get("marca") || ""
  const sku   = url.searchParams.get("sku")   || ""

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase.rpc("search_picker_products", {
    p_query: query || null,
    p_area:  area  || null,
    p_marca: marca || null,
    p_sku:   sku   || null,
    p_limit: 40,
  })

  if (error) {
    console.error("search_picker_products error", error)
    return NextResponse.json({ error: "No se pudo buscar productos." }, { status: 500 })
  }

  return NextResponse.json({ products: data || [] })
}
