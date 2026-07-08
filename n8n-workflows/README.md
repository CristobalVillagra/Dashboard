# Workflows n8n — Dashboard AIntegration

Importa cada archivo `.json` en **n8n > Workflows > Import from file**.

---

## Variables de entorno requeridas en n8n

Configúralas en **n8n > Settings > Environment Variables**:

| Variable | Descripción |
|---|---|
| `N8N_WEBHOOK_SECRET` | Mismo valor que en tu `.env` del dashboard |
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio |
| `TWILIO_FROM_NUMBER` | Número Twilio con formato `+1234...` |
| `GOOGLE_DRIVE_FOLDER_PARENT_ID` | ID de la carpeta Drive donde se subirán fotos |
| `GOOGLE_SHEETS_RESPALDOS_ID` | ID de la hoja de Google Sheets |

---

## Credenciales a crear en n8n

### Twilio (para SMS)
- Tipo: **HTTP Basic Auth** → nombre: `Twilio Basic Auth`
- Usuario: `TWILIO_ACCOUNT_SID`
- Contraseña: `TWILIO_AUTH_TOKEN`

### Google Drive
- Tipo: **Google Drive OAuth2** → nombre: `Google Drive OAuth`
- Requiere autorizar con la cuenta de Google que tiene acceso a la carpeta Drive

### Google Sheets
- Tipo: **Google Sheets OAuth2** → nombre: `Google Sheets OAuth`
- Puede reusar las mismas credenciales OAuth de Google Drive si la cuenta tiene acceso

---

## 01 – OTP SMS Dashboard

**Archivo:** `01-otp-sms.json`

**Webhook URL:** `https://n8n.tudominio.cl/webhook/user-otp-sms`

**Env en dashboard `.env`:**
```
SMS_OTP_WEBHOOK_URL=https://n8n.tudominio.cl/webhook/user-otp-sms
```

**Flujo:**
1. Dashboard llama al webhook con `{telefono, codigo, rol, mensaje}`
2. Valida `x-webhook-secret`
3. Envía SMS via Twilio API
4. Responde `{ok, twilio_sid, twilio_status}`

**Nota Twilio Trial:** Las cuentas de prueba solo pueden enviar a números verificados.
Para testing, verifica el número en: https://console.twilio.com/us1/develop/phone-numbers/verified

---

## 02 – Runner Response App Dispatch

**Archivo:** `02-runner-response-app.json`

**Webhook URL:** `https://n8n.tudominio.cl/webhook/app-runner-response-dispatch`

**Env en dashboard `.env`:**
```
N8N_APP_RUNNER_DISPATCH_WEBHOOK_URL=https://n8n.tudominio.cl/webhook/app-runner-response-dispatch
```

**Flujo:**
1. Cuando un runner responde una consulta de canal `app`, el dashboard llama a este webhook con `{consulta_id}`
2. n8n obtiene los datos de la consulta desde Supabase
3. Si el picker tiene teléfono, envía SMS de notificación: "Tu consulta de SKU XX fue respondida"
4. El picker también ve la respuesta en el panel (polling automático cada 15s)

---

## 03 – Respaldo Picker → Drive + Sheets

**Archivo:** `03-backup-drive-sheets.json`

**Webhook URL:** `https://n8n.tudominio.cl/webhook/app-respaldo-pedido`

**Env en dashboard `.env`:**
```
N8N_BACKUP_WEBHOOK_URL=https://n8n.tudominio.cl/webhook/app-respaldo-pedido
GOOGLE_DRIVE_FOLDER_PARENT_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
GOOGLE_SHEETS_RESPALDOS_ID=1BbCcDdEeFfGgHhIiJjKkLlMmNnOo
```

**Flujo:**
1. Picker sube foto de respaldo desde el panel → dashboard guarda en Supabase Storage y llama a este webhook con `{respaldo_id}`
2. n8n obtiene el registro desde Supabase
3. Descarga la foto desde Supabase Storage (URL pública o signed URL)
4. Sube la foto a Google Drive en la carpeta configurada
5. Registra una fila en Google Sheets: Fecha, Picker, Identificador (4 dígitos), Tipo (bicci/driver/uber/pickup), Drive URL
6. Actualiza el campo `drive_url` del registro en Supabase
7. Admin ve el `drive_url` en el panel de Respaldos

**Formato de la hoja Google Sheets (columnas esperadas):**

| Fecha | Picker | Identificador | Tipo Servicio | Drive URL | Foto Original |
|---|---|---|---|---|---|
| 30/06/2026 12:00 | Juan Perez | 1234 | bicci | https://drive... | https://storage... |

---

## Activar workflows

Después de importar y configurar credenciales:
1. Abre cada workflow
2. Haz click en el toggle **Active** (arriba a la derecha)
3. Verifica en **Executions** que lleguen las ejecuciones de prueba
