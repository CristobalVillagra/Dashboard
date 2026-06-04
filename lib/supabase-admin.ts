import { createClient } from "@supabase/supabase-js"

function resolveSupabaseProjectUrl(rawUrl: string) {
  const trimmedUrl = rawUrl.trim()

  if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(trimmedUrl)) {
    return trimmedUrl.replace(/\/$/, "")
  }

  const dashboardMatch = trimmedUrl.match(/supabase\.com\/(?:dashboard\/)?project\/([a-z0-9-]+)/i)
  if (dashboardMatch?.[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`
  }

  return trimmedUrl
}

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  }

  const projectUrl = resolveSupabaseProjectUrl(supabaseUrl)

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl)) {
    throw new Error("SUPABASE_URL debe ser la Project URL, por ejemplo https://xxxxx.supabase.co")
  }

  return createClient(projectUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
