# Variables de entorno requeridas en Vercel

Configura estas variables en **Settings → Environment Variables** de tu proyecto Vercel.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Sesión
RUNNER_SESSION_SECRET=<string aleatorio largo, min 32 chars>

# n8n Webhooks
N8N_BACKUP_WEBHOOK_URL=https://n8n.aintegration.cl/webhook/app-respaldo-pedido
N8N_REVISION_WEBHOOK_URL=https://n8n.aintegration.cl/webhook/app-respaldo-revision
N8N_WEBHOOK_SECRET=<secreto compartido con n8n>
N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL=<URL del webhook de dispatch de respuesta runner (app)>
N8N_RUNNER_DISPATCH_WEBHOOK_URL=<URL del webhook de dispatch de respuesta runner (whatsapp)>
N8N_RUNNER_RESPONSE_UPDATE_WEBHOOK_URL=<URL del webhook para actualizar respuesta runner>

# Twilio (para producción — ver instrucciones abajo)
TWILIO_ACCOUNT_SID=<Account SID de Twilio>
TWILIO_AUTH_TOKEN=<Auth Token de Twilio>
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # o tu número Twilio aprobado
```

> **Importante:** Las variables `N8N_*`, `SUPABASE_SERVICE_ROLE_KEY`, `RUNNER_SESSION_SECRET` y `TWILIO_*`
> son **server-only** — NO usar prefijo `NEXT_PUBLIC_`.

---

## Cómo activar Twilio para producción

Actualmente el proyecto usa n8n para enviar mensajes de WhatsApp.
Para migrar a Twilio directo:

1. Crear cuenta en [twilio.com](https://twilio.com)
2. Activar **WhatsApp Sandbox** (desarrollo) o solicitar número aprobado (producción)
3. Obtener `Account SID` y `Auth Token` del dashboard de Twilio
4. Agregar las variables `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` en Vercel
5. En el código, buscar donde se llama al webhook de n8n para envío de WhatsApp
   y reemplazar con el SDK de Twilio:

```typescript
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

await client.messages.create({
  from: process.env.TWILIO_WHATSAPP_FROM!,
  to: `whatsapp:${phoneNumber}`,
  body: mensajeTexto
})
```

6. Instalar SDK: `npm install twilio`
7. El número de destino debe estar en formato `whatsapp:+569XXXXXXXX`

---

## Configuración en n8n para producción

Los workflows de n8n que deben estar activos:

| Webhook path | Propósito |
|---|---|
| `app-respaldo-pedido` | Recibe respaldo nuevo, crea carpeta Drive, sube fotos |
| `app-respaldo-revision` | Recibe revisión admin, actualiza Google Sheets |
| `app-runner-response-dispatch` (o similar) | Notifica al picker (app) cuando runner responde |
| `runner-response-dispatch` (o similar) | Envía WhatsApp al picker cuando runner responde |
| `Bot SKU - Entrada WhatsApp` | Procesa consultas de pickers por WhatsApp |

Verificar los nombres exactos de cada workflow en tu instancia de n8n
y asegurarte de que los webhooks estén en modo **producción** (no test).

---

## Diferencias schema real vs spec

| Campo especificado | Campo real en BD | Nota |
|---|---|---|
| `revisado_at` | `revisado_en` | Columna ya existía con nombre distinto; el código usa `revisado_en` |
| `admin_status = 'revisado'` | `admin_status` text (default `'pendiente_revision'`) | Se actualiza al marcar revisado |
| `N8N_WEBHOOK_URL_DISPATCH` | `N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL` | Variable ya existente en el proyecto |
