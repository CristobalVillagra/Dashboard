import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { setRunnerCookie } from "@/lib/runner-auth"

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").trim()
}

function phoneVariants(phone: string) {
  const normalized = normalizePhone(phone)
  const digits = normalized.replace(/\D/g, "")
  const variants = new Set([normalized, digits])

  if (digits.startsWith("56")) {
    variants.add(`+${digits}`)
  }

  if (digits.length === 9 && digits.startsWith("9")) {
    variants.add(`+56${digits}`)
    variants.add(`56${digits}`)
  }

  return Array.from(variants).filter(Boolean)
}

export async function POST(request: Request) {
  try {
    const { telefono, codigo } = await request.json()
    const phone = normalizePhone(String(telefono || ""))
    const phones = phoneVariants(phone)
    const code = String(codigo || "").trim()

    if (!phone || code.length !== 6) {
      return NextResponse.json({ error: "Codigo invalido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()
    const { data: otp, error: otpError } = await supabase
      .from("otp_sessions")
      .select("id,telefono,codigo,usado,expira_en")
      .in("telefono", phones)
      .eq("codigo", code)
      .eq("usado", false)
      .gt("expira_en", now)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpError || !otp) {
      return NextResponse.json({ error: "Codigo incorrecto o expirado." }, { status: 401 })
    }

    const { data: runner, error: runnerError } = await supabase
      .from("usuarios")
      .select("telefono,nombre,rol,area")
      .eq("telefono", otp.telefono)
      .eq("rol", "runner")
      .single()

    if (runnerError || !runner) {
      return NextResponse.json({ error: "Runner no autorizado." }, { status: 403 })
    }

    await supabase.from("otp_sessions").update({ usado: true }).eq("id", otp.id)
    await supabase
      .from("usuarios")
      .update({ activo: true, ultimo_uso: now })
      .eq("telefono", otp.telefono)

    await setRunnerCookie({
      telefono: otp.telefono,
      nombre: runner.nombre || "Runner",
      area: runner.area || null,
    })

    return NextResponse.json({
      ok: true,
      runner: {
        telefono: otp.telefono,
        nombre: runner.nombre || "Runner",
        area: runner.area || null,
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo iniciar sesion." }, { status: 500 })
  }
}
