import { cookies } from "next/headers"
import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { normalizeArea } from "@/lib/areas"

const COOKIE_NAME = "runner_session"
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000          // runners: 1h
const PICKER_INACTIVITY_LIMIT_MS = 14 * 60 * 60 * 1000 // pickers: 14h turno

export type UserRole = "runner" | "admin" | "picker"

export type AppUser = {
  telefono: string
  nombre: string
  rol: UserRole
  area: string | null
  localId: string | null
  loginAt?: string
}

type SessionPayload = {
  telefono: string
  nombre: string
  rol: UserRole
  area: string | null
  localId: string | null
  loginAt?: string   // ISO timestamp del login para filtrar "esta sesión"
}

function getSessionSecret() {
  return process.env.RUNNER_SESSION_SECRET || "dev-runner-session-secret-change-me"
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url")
}

export function createRunnerSessionCookie(payload: SessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${encoded}.${sign(encoded)}`
}

export async function setRunnerCookie(payload: SessionPayload) {
  // Duración real de sesión según rol:
  // - runner/admin: 4 horas (turno máximo)
  // - picker: 14 horas (turno completo)
  // - dev: 2 horas (para no acumular sesiones al reiniciar)
  const isDev = process.env.NODE_ENV === "development"
  const maxAgeByRole =
    isDev
      ? 2 * 60 * 60
      : payload.rol === "picker"
        ? 14 * 60 * 60
        : 4 * 60 * 60

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, createRunnerSessionCookie(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeByRole,
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

  const dotIndex = value.lastIndexOf(".")
  if (dotIndex < 0) return null
  const encoded = value.slice(0, dotIndex)
  const signature = value.slice(dotIndex + 1)

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
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload
  } catch {
    return null
  }
}

export async function requireActiveUser({
  touch = true,
  roles = ["runner", "admin"] as UserRole[],
} = {}) {
  const session = await readRunnerSession()
  if (!session) {
    return { user: null, reason: "NO_SESSION" as const }
  }

  const supabase = getSupabaseAdmin()
  const { data: user, error } = await supabase
    .from("usuarios")
    .select("telefono,nombre,rol,area,activo,ultimo_uso,estado_usuario,local_id")
    .eq("telefono", session.telefono)
    .single()

  if (error || !user || !roles.includes(user.rol as UserRole)) {
    await clearRunnerCookie()
    return { user: null, reason: "INVALID_USER" as const }
  }

  if (user.estado_usuario !== "activo") {
    await clearRunnerCookie()
    return { user: null, reason: "INACTIVE" as const }
  }

  const lastUse = user.ultimo_uso ? new Date(user.ultimo_uso).getTime() : 0
  const limit = user.rol === "picker" ? PICKER_INACTIVITY_LIMIT_MS : INACTIVITY_LIMIT_MS
  const inactiveTooLong = !user.activo || Date.now() - lastUse > limit

  if (inactiveTooLong) {
    await supabase.from("usuarios").update({ activo: false }).eq("telefono", session.telefono)
    await clearRunnerCookie()
    return { user: null, reason: "INACTIVE" as const }
  }

  if (touch) {
    await supabase
      .from("usuarios")
      .update({ activo: true, ultimo_uso: new Date().toISOString(), estado_usuario: "activo" })
      .eq("telefono", session.telefono)
  }

  const appUser: AppUser = {
    telefono: user.telefono as string,
    nombre: (user.nombre as string) || session.nombre,
    rol: user.rol as UserRole,
    area: normalizeArea((user.area as string | null) || session.area),
    localId: (user.local_id as string | null) || session.localId || null,
    loginAt: session.loginAt,
  }

  return { user: appUser, reason: null }
}

export async function requireActiveRunner(options?: { touch?: boolean }) {
  const result = await requireActiveUser({ ...options, roles: ["runner"] })
  if (!result.user) return { runner: null, reason: result.reason }
  return { runner: result.user, reason: null }
}

export async function requireActiveAdmin(options?: { touch?: boolean }) {
  const result = await requireActiveUser({ ...options, roles: ["admin"] })
  if (!result.user) return { admin: null, reason: result.reason }
  return { admin: result.user, reason: null }
}

export async function requireActivePicker(options?: { touch?: boolean }) {
  const result = await requireActiveUser({ ...options, roles: ["picker"] })
  if (!result.user) return { picker: null, reason: result.reason }
  return { picker: result.user, reason: null }
}

export function generateOtpCode() {
  return String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, "0")
}
