import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActiveAdmin } from "@/lib/runner-auth"
import { dispatchPickerBackup, dispatchBackupRevision } from "@/lib/n8n-dispatch"

export async function GET(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  const url = new URL(request.url)
  const estado = url.searchParams.get("estado") || "pendiente"
  const sg = url.searchParams.get("sg")
  const tipoServicio = url.searchParams.get("tipo_servicio")

  const supabase = getSupabaseAdmin()

  let query = supabase
    .from("respaldos_pedido")
    .select("id,sg,telefono_picker,nombre_picker,tipo_servicio,foto_urls,estado,notas_admin,drive_url,drive_folder_url,revisado_por,revisado_en,created_at,local_id")
    .order("created_at", { ascending: false })
    .limit(100)

  if (sg) {
    query = query.eq("sg", sg.trim())
    if (tipoServicio) query = query.eq("tipo_servicio", tipoServicio)
  } else if (tipoServicio) {
    query = query.eq("tipo_servicio", tipoServicio)
  } else if (estado !== "all") {
    query = query.eq("estado", estado)
  }

  const { data, error } = await query

  if (error) {
    console.error("admin backups GET error", error)
    return NextResponse.json({ error: "No se pudieron cargar los respaldos." }, { status: 500 })
  }

  return NextResponse.json({ backups: data || [] })
}

export async function PATCH(request: Request) {
  const { admin, reason } = await requireActiveAdmin()

  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { id, estado, notas_admin, drive_url, motivoRechazo } = await request.json()

    if (!id) {
      return NextResponse.json({ error: "ID de respaldo requerido." }, { status: 400 })
    }

    if (!["revisado", "rechazado", "pendiente"].includes(estado)) {
      return NextResponse.json({ error: "Estado invalido." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    const updates: Record<string, string | null> = {
      estado,
      admin_status: estado === "revisado" || estado === "rechazado" ? estado : null,
      revisado_por: admin.nombre,
      revisado_en: now,
      updated_at: now,
    }

    if (estado === "rechazado" && motivoRechazo) {
      updates.motivo_rechazo = motivoRechazo
    }

    if (notas_admin !== undefined) updates.notas_admin = notas_admin || null
    if (drive_url !== undefined) updates.drive_url = drive_url || null

    const { data, error } = await supabase
      .from("respaldos_pedido")
      .update(updates)
      .eq("id", id)
      .select("id,estado,revisado_por,revisado_en")
      .single()

    if (error) throw error

    // Notificar n8n para actualizar Sheet (fire and forget)
    if (estado === "revisado" || estado === "rechazado") {
      dispatchBackupRevision(String(id), admin.nombre, estado, motivoRechazo || null)
    }

    return NextResponse.json({ ok: true, backup: data })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo actualizar el respaldo." }, { status: 500 })
  }
}

// POST /api/admin/backups — despachar respaldo a Google Drive vía n8n
export async function POST(request: Request) {
  const { admin, reason } = await requireActiveAdmin()
  if (!admin) {
    return NextResponse.json({ error: "No autorizado.", reason }, { status: 401 })
  }

  try {
    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: "ID de respaldo requerido." }, { status: 400 })
    }

    // Verificar que tiene fotos antes de despachar
    const supabase = getSupabaseAdmin()
    const { data: backup, error: fetchError } = await supabase
      .from("respaldos_pedido")
      .select("id, foto_urls, estado")
      .eq("id", id)
      .single()

    if (fetchError || !backup) {
      return NextResponse.json({ error: "Respaldo no encontrado." }, { status: 404 })
    }

    const fotoUrls: string[] = Array.isArray(backup.foto_urls)
      ? backup.foto_urls
      : []

    if (fotoUrls.length === 0) {
      return NextResponse.json({ error: "Este respaldo no tiene fotos para enviar a Drive." }, { status: 400 })
    }

    const dispatch = await dispatchPickerBackup(String(id))

    if (!dispatch.ok && !dispatch.skipped) {
      return NextResponse.json(
        { error: `No se pudo enviar a n8n: ${dispatch.error || "error desconocido"}` },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      skipped: dispatch.skipped,
      message: dispatch.skipped
        ? "Webhook de Drive no configurado (N8N_BACKUP_WEBHOOK_URL). Configúralo en las variables de entorno."
        : "Enviado a n8n. El Drive se actualizará en breve.",
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "Error al despachar el respaldo." }, { status: 500 })
  }
}
