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

  if (digits.startsWith("56")) variants.add(`+${digits}`)

  if (digits.length === 9 && digits.startsWith("9")) {
    variants.add(`+56${digits}`)
    variants.add(`56${digits}`)
  }

  return Array.from(variants).filter(Boolean)
}

async function postOtpWebhook(webhookUrl: string, payload: Record<string, string>) {
  const secret = process.env.N8N_WEBHOOK_SECRET
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      console.warn("Webhook OTP respondio con error", response.status, body)
    } else {
      console.log("Webhook OTP OK", response.status)
    }
  } catch (err) {
    // Timeout, red o Twilio trial — no bloquear el flujo (devCode sigue disponible)
    console.warn("Webhook OTP no alcanzado:", err instanceof Error ? err.message : String(err))
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request: Request) {
  try {
    const { telefono, nombre, area, rol: rolSolicitado } = await request.json()
    const phone = normalizePhone(String(telefono || ""))
    const phones = phoneVariants(phone)
    const cleanName = String(nombre || "").trim()
    const cleanArea = normalizeArea(area)
    const cleanRol: "runner" | "picker" = rolSolicitado === "picker" ? "picker" : "runner"

    if (phone.length < 8) {
      return NextResponse.json({ error: "Ingresa un numero de celular valido." }, { status: 400 })
    }

    if (area && !cleanArea) {
      return NextResponse.json({ error: "Selecciona un area valida." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Buscar por todos los roles (runner, admin, picker)
    const { data: existingUser, error: userError } = await supabase
      .from("usuarios")
      .select("telefono,nombre,rol,area,activo,estado_usuario,local_id")
      .in("telefono", phones)
      .in("rol", ["runner", "admin", "picker"])
      .maybeSingle()

    if (userError) throw userError

    // Auto-registro: runner necesita nombre+area, picker solo nombre
    if (!existingUser) {
      const needsArea = cleanRol === "runner"
      if (!cleanName || (needsArea && !cleanArea)) {
        return NextResponse.json(
          { error: "Completa tu nombre para registrarte.", needsRegistration: true },
          { status: 404 },
        )
      }

      const newPhone =
        phones.find((v) => v.startsWith("+56")) ||
        phones.find((v) => v.startsWith("56")) ||
        phone

      const { data: local } = await supabase.from("locales").select("id").eq("codigo", "55").maybeSingle()

      const { error: createError } = await supabase.from("usuarios").insert({
        telefono: newPhone,
        nombre: cleanName,
        rol: cleanRol,
        area: cleanRol === "runner" ? cleanArea : null,
        activo: false,
        estado_usuario: "pendiente_aprobacion",
        local_id: local?.id || null,
        creado_en: new Date().toISOString(),
      })

      if (createError) throw createError

      return NextResponse.json({
        ok: true,
        pendingApproval: true,
        message:
          cleanRol === "picker"
            ? "Registro enviado. El admin aprobara tu cuenta y luego podrás ingresar en /picker."
            : "Registro enviado. Un administrador debe aprobar tu cuenta antes de solicitar el codigo.",
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

    // Evitar spam: no reenviar si hay un OTP reciente (< 1 minuto)
    const { data: recentOtp, error: recentOtpError } = await supabase
      .from("otp_sessions")
      .select("id")
      .eq("telefono", userPhone)
      .eq("usado", false)
      .gt("expira_en", new Date(Date.now() + 9 * 60 * 1000).toISOString())
      .order("expira_en", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentOtpError) throw recentOtpError

    if (recentOtp) {
      return NextResponse.json(
        { error: "Ya enviamos un codigo hace poco. Espera un momento antes de pedir otro." },
        { status: 429 },
      )
    }

    const { error: insertError } = await supabase.from("otp_sessions").insert({
      telefono: userPhone,
      codigo: code,
      usado: false,
      expira_en: expiresAt,
    })

    if (insertError) throw insertError

    // Webhook OTP unificado: SMS_OTP_WEBHOOK_URL sirve para todos los roles
    // (el n8n decide el canal segun el numero/rol recibido).
    // WHATSAPP_OTP_WEBHOOK_URL se usa como fallback solo para runners/admins si no hay SMS_OTP_WEBHOOK_URL.
    const smsWebhookUrl = process.env.SMS_OTP_WEBHOOK_URL
    const whatsappWebhookUrl = process.env.WHATSAPP_OTP_WEBHOOK_URL
    const otpWebhookUrl = smsWebhookUrl || (existingUser.rol !== "picker" ? whatsappWebhookUrl : null)

    const isDev = process.env.NODE_ENV === "development"

    if (otpWebhookUrl) {
      await postOtpWebhook(otpWebhookUrl, {
        telefono: userPhone,
        codigo: code,
        rol: existingUser.rol,
        mensaje: `Tu codigo de acceso es ${code}. Expira en 10 minutos.`,
      })
      return NextResponse.json({
        ok: true,
        message: smsWebhookUrl ? "Codigo enviado por SMS." : "Codigo enviado por WhatsApp.",
        // En desarrollo, incluir el codigo para facilitar pruebas sin SMS real
        ...(isDev ? { devCode: code } : {}),
      })
    }

    // Sin webhook configurado: mostrar codigo en respuesta
    return NextResponse.json({
      ok: true,
      message: "Modo prueba — codigo disponible en esta respuesta.",
      devCode: code,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo generar el codigo." }, { status: 500 })
  }
}
