import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { generateOtpCode } from "@/lib/runner-auth"
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
    const { telefono, nombre, area } = await request.json()
    const phone = normalizePhone(String(telefono || ""))
    const phones = phoneVariants(phone)
    const cleanName = String(nombre || "").trim()
    const cleanArea = normalizeArea(area)

    if (phone.length < 8) {
      return NextResponse.json({ error: "Ingresa un numero de celular valido." }, { status: 400 })
    }

    if (area && !cleanArea) {
      return NextResponse.json({ error: "Selecciona un area valida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data: existingUser, error: userError } = await supabase
      .from("usuarios")
      .select("telefono,nombre,rol,area,activo,estado_usuario,local_id")
      .in("telefono", phones)
      .in("rol", ["runner", "admin"])
      .maybeSingle()

    if (userError) throw userError

    if (!existingUser && (!cleanName || !cleanArea)) {
      return NextResponse.json(
        { error: "Completa nombre y area para registrar este runner.", needsRegistration: true },
        { status: 404 },
      )
    }

    if (!existingUser) {
      const runnerPhone =
        phones.find((variant) => variant.startsWith("+56")) ||
        phones.find((variant) => variant.startsWith("56")) ||
        phone

      const { data: local } = await supabase.from("locales").select("id").eq("codigo", "55").maybeSingle()

      const { error: createError } = await supabase.from("usuarios").insert({
        telefono: runnerPhone,
        nombre: cleanName,
        rol: "runner",
        area: cleanArea,
        activo: false,
        estado_usuario: "pendiente_aprobacion",
        local_id: local?.id || null,
        creado_en: new Date().toISOString(),
      })

      if (createError) throw createError

      return NextResponse.json({
        ok: true,
        pendingApproval: true,
        message: "Registro enviado. Un administrador debe aprobar tu cuenta antes de solicitar el codigo.",
      })
    }

    if (existingUser.estado_usuario === "pendiente_aprobacion") {
      return NextResponse.json(
        { error: "Tu registro esta pendiente de aprobacion por un administrador." },
        { status: 403 },
      )
    }

    if (existingUser.estado_usuario === "rechazado") {
      return NextResponse.json({ error: "Tu registro fue rechazado. Contacta al administrador." }, { status: 403 })
    }

    if (existingUser.estado_usuario !== "activo") {
      return NextResponse.json({ error: "Tu cuenta no esta activa. Contacta al administrador." }, { status: 403 })
    }

    const code = generateOtpCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const userPhone = existingUser.telefono

    const { error: insertError } = await supabase.from("otp_sessions").insert({
      telefono: userPhone,
      codigo: code,
      usado: false,
      expira_en: expiresAt,
    })

    if (insertError) throw insertError

    const webhookUrl = process.env.WHATSAPP_OTP_WEBHOOK_URL
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          telefono: userPhone,
          codigo: code,
          mensaje: `Tu codigo de acceso runner es ${code}. Expira en 10 minutos.`,
        }),
      })
    }

    return NextResponse.json({
      ok: true,
      message: "Codigo enviado por WhatsApp.",
      devCode: webhookUrl ? undefined : code,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo generar el codigo." }, { status: 500 })
  }
}
