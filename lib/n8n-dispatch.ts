const N8N_TIMEOUT_MS = 3500

export async function dispatchAppRunnerResponse(consultaId: string | number) {
  const webhookUrl = process.env.N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    console.warn("N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL no configurada; notificacion app no despachada.")
    return { ok: false, skipped: true, status: 0, error: "N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL no configurada." }
  }

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({ consultaId: String(consultaId), secret }),
    })
    const text = await response.text().catch(() => "")
    return { ok: response.ok, skipped: false, status: response.status, response: text }
  } catch (error) {
    return {
      ok: false, skipped: false, status: 0,
      error: error instanceof Error ? error.message : "Timeout o error llamando webhook app.",
    }
  }
}

export async function dispatchBackupRevision(
  respaldoId: string,
  adminNombre: string,
  accion: "revisado" | "rechazado" = "revisado",
  motivoRechazo?: string | null,
) {
  // El webhook unificado maneja tanto creación (picker) como revisión (admin)
  const webhookUrl = process.env.N8N_BACKUP_WEBHOOK_URL || process.env.N8N_REVISION_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    console.warn("N8N_BACKUP_WEBHOOK_URL no configurada; revision no notificada a n8n.")
    return { ok: false, skipped: true }
  }

  // Fire and forget — no bloquear al admin
  fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify({
      respaldoId,
      accion,
      adminNombre,
      ...(motivoRechazo ? { motivoRechazo } : {}),
    }),
  }).catch((err) => console.error("[revision-respaldo] webhook error:", err))

  return { ok: true, skipped: false }
}

export async function dispatchPickerBackup(respaldoId: string) {
  const webhookUrl = process.env.N8N_BACKUP_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    console.warn("N8N_BACKUP_WEBHOOK_URL no configurada; respaldo no enviado a n8n.")
    return { ok: false, skipped: true, status: 0, error: "N8N_BACKUP_WEBHOOK_URL no configurada." }
  }

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({ respaldoId, secret }),
    })
    const text = await response.text().catch(() => "")
    return { ok: response.ok, skipped: false, status: response.status, response: text }
  } catch (error) {
    return {
      ok: false, skipped: false, status: 0,
      error: error instanceof Error ? error.message : "Timeout o error llamando webhook respaldo.",
    }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = N8N_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function dispatchRunnerResponse(consultaId: string | number, localId?: string | null) {
  const webhookUrl = process.env.N8N_RUNNER_DISPATCH_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    console.warn("N8N_RUNNER_DISPATCH_WEBHOOK_URL no configurada; WhatsApp no se despachara automaticamente.")
    return { ok: false, skipped: true, status: 0, error: "N8N_RUNNER_DISPATCH_WEBHOOK_URL no configurada." }
  }

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({
        consultaId: String(consultaId),
        localId: localId || null,
        secret,
      }),
    })

    const responseText = await response.text().catch(() => "")

    if (!response.ok) {
      console.error("Webhook n8n fallo", consultaId, response.status, responseText)
      return {
        ok: false,
        skipped: false,
        status: response.status,
        error: responseText || `Webhook n8n respondio ${response.status}.`,
      }
    }

    return { ok: true, skipped: false, status: response.status, response: responseText }
  } catch (error) {
    console.error("Error llamando webhook n8n", consultaId, error)
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: error instanceof Error ? error.message : "Timeout o error llamando webhook n8n.",
    }
  }
}

function resolveUpdateWebhookUrl() {
  if (process.env.N8N_RUNNER_RESPONSE_UPDATE_WEBHOOK_URL) {
    return process.env.N8N_RUNNER_RESPONSE_UPDATE_WEBHOOK_URL
  }

  const dispatchUrl = process.env.N8N_RUNNER_DISPATCH_WEBHOOK_URL
  return dispatchUrl?.replace(/runner-response-dispatch\/?$/, "runner-response-update")
}

export async function dispatchRunnerResponseUpdate(consultaId: string | number, textoNuevo: string, sku: string) {
  const webhookUrl = resolveUpdateWebhookUrl()
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    console.warn("N8N_RUNNER_RESPONSE_UPDATE_WEBHOOK_URL no configurada; WhatsApp no se despachara automaticamente.")
    return { ok: false, skipped: true, status: 0, error: "N8N_RUNNER_RESPONSE_UPDATE_WEBHOOK_URL no configurada." }
  }

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        consulta_id: String(consultaId),
        texto_nuevo: textoNuevo,
        sku,
        secret,
      }),
    })

    const responseText = await response.text().catch(() => "")

    if (!response.ok) {
      console.error("Webhook n8n actualizacion fallo", consultaId, response.status, responseText)
      return {
        ok: false,
        skipped: false,
        status: response.status,
        error: responseText || `Webhook n8n respondio ${response.status}.`,
      }
    }

    return { ok: true, skipped: false, status: response.status, response: responseText }
  } catch (error) {
    console.error("Error llamando webhook n8n actualizacion", consultaId, error)
    return {
      ok: false,
      skipped: false,
      status: 0,
      error: error instanceof Error ? error.message : "Timeout o error llamando webhook n8n.",
    }
  }
}
