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

---

## Modo desarrollo: OTP visible en respuesta

En `NODE_ENV !== 'production'` (o cuando no hay webhook configurado), el endpoint
`/api/auth/request-otp` retorna el campo `devCode` en la respuesta JSON con el código OTP.
Esto facilita pruebas sin necesitar SMS/WhatsApp real.

**En producción (Vercel):** `NODE_ENV=production` automáticamente, por lo que `devCode`
**nunca** aparece en la respuesta. El código se envía exclusivamente por SMS/WhatsApp vía webhook.

No hay ninguna configuración adicional requerida — el comportamiento es automático.

---

## Escalabilidad y sesiones concurrentes

### Sistema de sesiones

El proyecto usa **cookies HMAC firmadas stateless** (ver `lib/runner-auth.ts`):

- La cookie `runner_session` contiene el payload codificado en base64url más una firma HMAC-SHA256.
- Cada request valida la firma criptográficamente — **sin consultar la base de datos** para verificar la sesión.
- Supabase solo se consulta para obtener datos del usuario (rol, estado, `ultimo_uso`).
- No existe estado en memoria ni tabla de sesiones en BD.

**Consecuencia:** el sistema escala horizontalmente en Vercel sin configuración adicional.
Múltiples instancias de la función Edge comparten el mismo `RUNNER_SESSION_SECRET` (variable de entorno)
y cada una puede validar cualquier cookie sin coordinarse entre sí.

### Duración de sesión por rol

| Rol | Duración cookie | Inactividad máxima |
|---|---|---|
| runner / admin | 4 horas | 1 hora |
| picker | 14 horas (turno completo) | 14 horas |
| desarrollo | 2 horas | – |

### Para alta concurrencia (>100 usuarios simultáneos)

Activar pgBouncer en Supabase para connection pooling:

```
Project Settings → Database → Connection Pooling → Enable
Mode: Transaction
Connection string: postgresql://postgres.xxx:PASS@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Actualizar `NEXT_PUBLIC_SUPABASE_URL` (o la variable de conexión directa en `lib/supabase-admin.ts`)
para usar la URL del pooler en lugar de la conexión directa.

---

## Limpieza automática de datos de turno (Vercel Cron)

El archivo `vercel.json` configura dos cron jobs automáticos (lunes a sábado):

| Horario Chile | UTC | Endpoint | Acción |
|---|---|---|---|
| 7:00 AM | 11:00 UTC | `/api/admin/cleanup?tipo=inicio_turno` | Archiva consultas del día anterior; libera tickets stuck |
| 21:00 PM | 01:00 UTC (+1d) | `/api/admin/cleanup?tipo=fin_turno` | Desactiva respuestas automáticas no fijadas |

### Variable de entorno requerida

```
CRON_SECRET=<string aleatorio seguro, min 32 chars>
```

Configurar en **Vercel → Settings → Environment Variables**.

Vercel envía automáticamente `Authorization: Bearer <CRON_SECRET>` en cada llamada al cron.
El endpoint también acepta el header `x-cron-secret` para llamadas manuales/testing.

### Llamada manual

```bash
curl "https://tu-proyecto.vercel.app/api/admin/cleanup?tipo=inicio_turno" \
  -H "x-cron-secret: TU_CRON_SECRET"

curl "https://tu-proyecto.vercel.app/api/admin/cleanup?tipo=fin_turno" \
  -H "x-cron-secret: TU_CRON_SECRET"
```

### Qué limpia cada cron

**inicio_turno (7 AM):**
- Consultas SKU de turnos anteriores → `archivada = true` (no se eliminan)
- Tickets en estado `tomada` de turnos anteriores → regresan a `pendiente_sin_asignar`

**fin_turno (21:00 PM):**
- Respuestas automáticas en `sku_respuestas` con `respuesta_fija = false` → `activo = false`
- Las respuestas con `respuesta_fija = true` NO se tocan (solo el admin las desactiva)

### Schema: columna agregada

```sql
-- Ejecutado vía migración Supabase
ALTER TABLE public.consultas_sku ADD COLUMN IF NOT EXISTS archivada boolean DEFAULT false;
```

---

## Diferencias schema real vs spec

| Campo especificado | Campo real en BD | Nota |
|---|---|---|
| `revisado_at` | `revisado_en` | Columna ya existía con nombre distinto; el código usa `revisado_en` |
| `admin_status = 'revisado'` | `admin_status` text (default `'pendiente_revision'`) | Se actualiza al marcar revisado |
| `N8N_WEBHOOK_URL_DISPATCH` | `N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL` | Variable ya existente en el proyecto |
