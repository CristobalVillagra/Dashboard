import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"

type CleanupTipo = "inicio_turno" | "fin_turno" | "archivar_whatsapp"

// GET /api/admin/cleanup?tipo=inicio_turno | fin_turno
//
// Auth: sesión admin activa  O  header x-cron-secret == CRON_SECRET (para Vercel Cron).
// Vercel Cron invoca con GET y agrega automáticamente Authorization: Bearer <CRON_SECRET>.
// También aceptamos x-cron-secret para compatibilidad con llamadas manuales.
export async function GET(request: Request) {
  // ── Autenticación ──────────────────────────────────────────────────────────
  const isVercelCron = request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
  const isManualCron =
    process.env.CRON_SECRET &&
    request.headers.get("x-cron-secret") === process.env.CRON_SECRET

  if (!isVercelCron && !isManualCron) {
    const { admin } = await requireActiveAdmin({ touch: false })
    if (!admin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 })
    }
  }

  // ── Tipo de limpieza ───────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get("tipo") as CleanupTipo | null

  if (!tipo || !["inicio_turno", "fin_turno", "archivar_whatsapp"].includes(tipo)) {
    return NextResponse.json(
      { error: "Parámetro tipo requerido: inicio_turno | fin_turno | archivar_whatsapp" },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()
  const resultado: Record<string, number | string> = { tipo, ejecutado_en: new Date().toISOString() }

  try {
    if (tipo === "inicio_turno") {
      // 1. Archivar consultas de turno(s) anterior(es)
      //    turno_fecha < hoy (no today's shift)
      const { error: archErr, count: archCount } = await supabase
        .from("consultas_sku")
        .update({ archivada: true })
        .lt("turno_fecha", new Date().toISOString().slice(0, 10))
        .neq("archivada", true)
        .select("id", { count: "exact", head: true })

      if (archErr) throw new Error(`archivado: ${archErr.message}`)
      resultado.consultas_archivadas = archCount ?? 0

      // 2. Liberar tickets de runner que quedaron "tomados" en turnos anteriores
      //    (runner que no respondió → volver a pendiente para que otro tome)
      const { error: releaseErr, count: releaseCount } = await supabase
        .from("consultas_sku")
        .update({
          estado: "pendiente_sin_asignar",
          telefono_runner: null,
          nombre_runner: null,
          assigned_at: null,
        })
        .eq("estado", "tomada")
        .lt("turno_fecha", new Date().toISOString().slice(0, 10))
        .select("id", { count: "exact", head: true })

      if (releaseErr) throw new Error(`liberado: ${releaseErr.message}`)
      resultado.tickets_liberados = releaseCount ?? 0
    }

    if (tipo === "fin_turno") {
      // Desactivar respuestas automáticas no fijadas permanentemente
      const { error: respErr, count: respCount } = await supabase
        .from("sku_respuestas")
        .update({ activo: false })
        .eq("activo", true)
        .eq("respuesta_fija", false)
        .select("id", { count: "exact", head: true })

      if (respErr) throw new Error(`sku_respuestas: ${respErr.message}`)
      resultado.respuestas_desactivadas = respCount ?? 0
    }

    if (tipo === "archivar_whatsapp") {
      const { error: archWaErr, count: archWaCount } = await supabase
        .from("consultas_sku")
        .update({ archivada: true })
        .eq("canal", "whatsapp")
        .neq("archivada", true)
        .lt("created_at", new Date().toISOString().slice(0, 10))
        .select("id", { count: "exact", head: true })

      if (archWaErr) throw new Error(`archivar_whatsapp: ${archWaErr.message}`)
      resultado.consultas_whatsapp_archivadas = archWaCount ?? 0
    }

    return NextResponse.json({ ok: true, ...resultado })
  } catch (err) {
    console.error("[cleanup]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno." },
      { status: 500 },
    )
  }
}
