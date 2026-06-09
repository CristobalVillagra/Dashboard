export async function dispatchRunnerResponse(consultaId: string | number, localId?: string | null) {
  const webhookUrl = process.env.N8N_RUNNER_DISPATCH_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    console.warn("N8N_RUNNER_DISPATCH_WEBHOOK_URL no configurada; WhatsApp no se despachara automaticamente.")
    return { ok: false, skipped: true, status: 0, error: "N8N_RUNNER_DISPATCH_WEBHOOK_URL no configurada." }
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({
        consultaId: String(consultaId),
        localId: localId || null,
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
      error: error instanceof Error ? error.message : "Error llamando webhook n8n.",
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
    const response = await fetch(webhookUrl, {
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
      error: error instanceof Error ? error.message : "Error llamando webhook n8n.",
    }
  }
}
