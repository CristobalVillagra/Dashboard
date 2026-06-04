import { cookies } from "next/headers"
import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

const COOKIE_NAME = "runner_session"
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000

type RunnerSessionPayload = {
  telefono: string
  nombre: string
  area: string | null
}

function getSessionSecret() {
  return process.env.RUNNER_SESSION_SECRET || "dev-runner-session-secret-change-me"
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url")
}

export function createRunnerSessionCookie(payload: RunnerSessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${encoded}.${sign(encoded)}`
}

export async function setRunnerCookie(payload: RunnerSessionPayload) {
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, createRunnerSessionCookie(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearRunnerCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function readRunnerSession() {
  const cookieStore = await cookies()
  const value = cookieStore.get(COOKIE_NAME)?.value

  if (!value) return null

  const [encoded, signature] = value.split(".")
  if (!encoded || !signature) return null

  const expected = sign(encoded)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as RunnerSessionPayload
  } catch {
    return null
  }
}

export async function requireActiveRunner({ touch = true } = {}) {
  const session = await readRunnerSession()
  if (!session) {
    return { runner: null, reason: "NO_SESSION" as const }
  }

  const supabase = getSupabaseAdmin()
  const { data: user, error } = await supabase
    .from("usuarios")
    .select("telefono,nombre,rol,area,activo,ultimo_uso")
    .eq("telefono", session.telefono)
    .single()

  if (error || !user || user.rol !== "runner") {
    await clearRunnerCookie()
    return { runner: null, reason: "INVALID_RUNNER" as const }
  }

  const lastUse = user.ultimo_uso ? new Date(user.ultimo_uso).getTime() : 0
  const inactiveTooLong = !user.activo || Date.now() - lastUse > INACTIVITY_LIMIT_MS

  if (inactiveTooLong) {
    await supabase.from("usuarios").update({ activo: false }).eq("telefono", session.telefono)
    await clearRunnerCookie()
    return { runner: null, reason: "INACTIVE" as const }
  }

  if (touch) {
    await supabase
      .from("usuarios")
      .update({ activo: true, ultimo_uso: new Date().toISOString() })
      .eq("telefono", session.telefono)
  }

  return {
    runner: {
      telefono: user.telefono as string,
      nombre: (user.nombre as string) || session.nombre,
      area: (user.area as string | null) || session.area,
    },
    reason: null,
  }
}

export function generateOtpCode() {
  return String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, "0")
}
