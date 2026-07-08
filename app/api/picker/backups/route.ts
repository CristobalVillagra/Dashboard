import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireActivePicker } from "@/lib/runner-auth"
import { dispatchPickerBackup } from "@/lib/n8n-dispatch"

export async function POST(request: Request) {
  const { picker, reason } = await requireActivePicker()

  if (!picker) {
    return NextResponse.json({ error: "Sesion expirada.", reason }, { status: 401 })
  }

  try {
    const contentType = request.headers.get("content-type") || ""

    let identificador = ""
    let tipo_servicio = ""
    let foto_urls: string[] = []

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      identificador = String(formData.get("identificador") || "").trim()
      tipo_servicio = String(formData.get("tipo_servicio") || "").trim()

      const supabase = getSupabaseAdmin()

      // Auto-crear bucket si no existe
      const { data: existingBucket } = await supabase.storage.getBucket("backup-fotos")
      if (!existingBucket) {
        const { error: bucketError } = await supabase.storage.createBucket("backup-fotos", {
          public: true,
          fileSizeLimit: 10485760, // 10 MB
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic"],
        })
        if (bucketError && !bucketError.message?.includes("already exists")) {
          console.error("No se pudo crear bucket backup-fotos", bucketError)
          return NextResponse.json({ error: "Error al configurar el almacenamiento. Crea el bucket 'backup-fotos' en Supabase Storage." }, { status: 500 })
        }
      }

      const photoFiles = formData.getAll("fotos") as File[]

      for (const file of photoFiles) {
        if (!file || !file.size) continue

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
        const safePath = `${picker.telefono.replace(/[^0-9+]/g, "")}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("backup-fotos")
          .upload(safePath, buffer, {
            contentType: file.type || "image/jpeg",
            upsert: false,
          })

        if (uploadError) {
          console.warn("Error subiendo foto", safePath, uploadError)
          continue
        }

        const { data: urlData } = supabase.storage.from("backup-fotos").getPublicUrl(uploadData.path)
        if (urlData?.publicUrl) {
          foto_urls.push(urlData.publicUrl)
        }
      }
    } else {
      const body = await request.json()
      identificador = String(body.identificador || "").trim()
      tipo_servicio = String(body.tipo_servicio || "").trim()
      foto_urls = Array.isArray(body.foto_urls) ? body.foto_urls : []
    }

    // SG: exactamente 4 dígitos numéricos.
    const cleanSg = identificador.replace(/\s/g, "")
    if (!cleanSg || !/^\d{4}$/.test(cleanSg)) {
      return NextResponse.json({ error: "La SG debe ser un número de 4 dígitos." }, { status: 400 })
    }
    const sg = cleanSg

    if (!["bicci", "driver", "uber", "pickup"].includes(tipo_servicio)) {
      return NextResponse.json({ error: "Tipo de servicio invalido." }, { status: 400 })
    }

    if (foto_urls.length === 0) {
      return NextResponse.json({ error: "Debes adjuntar al menos una foto." }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase.rpc("create_picker_backup_report", {
      p_telefono_picker: picker.telefono,
      p_nombre_picker:   picker.nombre,
      p_identificador:   sg,
      p_tipo_servicio:   tipo_servicio,
      p_foto_urls:       foto_urls,
      p_local_id:        picker.localId || null,
    })

    if (error) {
      console.error("create_picker_backup_report error", error)
      if (error.code === "PGRST202" || String(error.message).includes("schema cache")) {
        return NextResponse.json(
          { error: "La base de datos necesita actualizarse. Ejecuta la migración 008_picker_internal_app.sql en Supabase." },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: error.message || "No se pudo registrar el respaldo." }, { status: 500 })
    }

    const result = Array.isArray(data) ? data[0] : data

    // Notificar a n8n para subir a Drive y registrar en Sheet
    const dispatch = await dispatchPickerBackup(String(result.respaldo_id))
    if (!dispatch.ok && !dispatch.skipped) {
      console.warn("Backup dispatch a n8n fallo", dispatch.error)
    }

    return NextResponse.json({ ok: true, respaldo: result }, { status: 201 })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "No se pudo registrar el respaldo." }, { status: 500 })
  }
}
