import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { generateOtpCode } from "@/lib/runner-auth"

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
    const cleanArea = String(area || "").trim().toLowerCase()

    if (phone.length < 8) {
      return NextResponse.json({ error: "Ingresa un numero de celular valido." }, { status: 400 })
    }

    if (cleanArea && !["frio", "sala", "gm"].includes(cleanArea)) {
      return NextResponse.json({ error: "Selecciona un area valida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    let { data: runner, error: runnerError } = await supabase
      .from("usuarios")
      .select("telefono,nombre,rol,area,activo")
      .in("telefono", phones)
      .eq("rol", "runner")
      .maybeSingle()

    if (runnerError) throw runnerError

    if (!runner && (!cleanName || !cleanArea)) {
      return NextResponse.json(
        { error: "Completa nombre y area para registrar este runner.", needsRegistration: true },
        { status: 404 },
      )
    }

    if (!runner) {
      const runnerPhone = phones.find((variant) => variant.startsWith("+56")) || phones.find((variant) => variant.startsWith("56")) || phone
      const { data: createdRunner, error: createError } = await supabase
        .from("usuarios")
        .insert({
          telefono: runnerPhone,
          nombre: cleanName,
          rol: "runner",
          area: cleanArea,
          activo: false,
          creado_en: new Date().toISOString(),
        })
        .select("telefono,nombre,rol,area,activo")
        .single()

      if (createError) throw createError
      runner = createdRunner
    }

    const code = generateOtpCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const runnerPhone = runner.telefono

    const { error: insertError } = await supabase.from("otp_sessions").insert({
      telefono: runnerPhone,
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
          telefono: runnerPhone,
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
