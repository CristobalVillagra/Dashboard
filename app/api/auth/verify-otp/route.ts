import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { setRunnerCookie } from "@/lib/runner-auth"
import { normalizeArea } from "@/lib/areas"

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

    const { data: user, error: userError } = await supabase
      .from("usuarios")
      .select("telefono,nombre,rol,area,estado_usuario,local_id")
      .eq("telefono", otp.telefono)
      .in("rol", ["runner", "admin"])
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "Usuario no autorizado." }, { status: 403 })
    }

    if (user.estado_usuario !== "activo") {
      return NextResponse.json({ error: "Tu cuenta no esta activa o pendiente de aprobacion." }, { status: 403 })
    }

    await supabase.from("otp_sessions").update({ usado: true }).eq("id", otp.id)
    await supabase
      .from("usuarios")
      .update({ activo: true, ultimo_uso: now, estado_usuario: "activo" })
      .eq("telefono", otp.telefono)

    const sessionUser = {
      telefono: otp.telefono,
      nombre: user.nombre || "Usuario",
      rol: user.rol as "runner" | "admin",
      area: normalizeArea(user.area),
      localId: (user.local_id as string | null) || null,
    }

    await setRunnerCookie(sessionUser)

    return NextResponse.json({
      ok: true,
      user: {
        telefono: sessionUser.telefono,
        nombre: sessionUser.nombre,
        rol: sessionUser.rol,
        area: sessionUser.area,
        localId: sessionUser.localId,
      },
      runner:
        sessionUser.rol === "runner"
          ? {
              telefono: sessionUser.telefono,
              nombre: sessionUser.nombre,
              area: sessionUser.area,
            }
          : undefined,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo iniciar sesion." }, { status: 500 })
  }
}
