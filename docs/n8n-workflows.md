# VYLTA — Workflows de n8n

> Arquitectura simplificada Mar 2026: n8n **únicamente envía mensajes salientes**.
> No procesa mensajes entrantes. Las citas se crean vía link público (book.html?n=slug).

---

## Número de ejecuciones por cita

| Workflow | Ejecuciones |
|----------|------------|
| Confirmación al agendar | 1 |
| Recordatorio 24h | 1 |
| Recordatorio 2h | 1 |
| **Total por cita** | **3** |

Con el plan Starter de n8n (2,500 ejecuciones/mes) = ~833 citas/mes máximo.

---

## Workflow 1 — Confirmación al agendar

**Trigger:** Supabase — nuevo row en tabla `appointments`

```
Trigger: Supabase Webhook
  tabla: appointments
  evento: INSERT
  condición: source = 'app' OR source = 'public_link'
        AND status = 'Pendiente' OR status = 'Solicitud'
        AND user confirmaó notificación (whatsapp_notification = true)

  ↓

Node: Supabase GET
  consulta: whatsapp_config WHERE user_id = {{appointment.user_id}}
  verificar: confirmationOnBooking = true

  ↓

Node: Supabase GET
  consulta: clients WHERE id = {{appointment.client_id}}
  OR usar: client_name_temp + client_phone_temp (citas del link público)

  ↓

Node: HTTP Request (WhatsApp API)
  método: POST
  url: https://graph.facebook.com/v18.0/{{PHONE_NUMBER_ID}}/messages
  body:
    to: {{client.phone}}
    type: template
    template:
      name: vylta_confirmacion
      language: es_MX
      components:
        - type: body
          parameters:
            - {{business_name}}
            - {{service_name}}
            - {{date}} (ej: lunes 23 de marzo)
            - {{start_time}}
```

**Template WhatsApp (aprobar en Meta):**
```
Hola 👋 Tu cita en *{{1}}* está confirmada.

Servicio: {{2}}
Fecha: {{3}}
Hora: {{4}}

Te esperamos ✅
```

---

## Workflow 2 — Recordatorio 24 horas antes

**Trigger:** n8n Schedule — cron diario a las 8:00 AM (hora México, UTC-6)

```
Trigger: Cron
  expresión: 0 14 * * *  (8:00 AM Ciudad de México = 14:00 UTC)

  ↓

Node: Supabase GET
  consulta:
    SELECT a.*, c.phone, c.name, bp.business_name, wc.reminder_24h
    FROM appointments a
    LEFT JOIN clients c ON c.id = a.client_id
    JOIN business_profiles bp ON bp.user_id = a.user_id
    JOIN whatsapp_config wc ON wc.user_id = a.user_id
    WHERE a.date = CURRENT_DATE + 1
      AND a.status IN ('Pendiente', 'Confirmada')
      AND wc.reminder_24h = true

  ↓

Node: Loop Over Items
  por cada cita:

    ↓

    Node: HTTP Request (WhatsApp API)
      template: vylta_recordatorio_24h
      parámetros:
        - {{business_name}}
        - {{service_name}}
        - {{date}}
        - {{start_time}}
```

**Template WhatsApp:**
```
Recordatorio 🔔 Tu cita en *{{1}}* es mañana.

Servicio: {{2}}
Fecha: {{3}}
Hora: {{4}}

¿Necesitas reagendar? Respóndenos y con gusto te ayudamos.
```

---

## Workflow 3 — Recordatorio 2 horas antes

**Trigger:** n8n Schedule — cron cada hora en punto

```
Trigger: Cron
  expresión: 0 * * * *  (cada hora en punto)

  ↓

Node: Supabase GET
  consulta:
    SELECT a.*, c.phone, c.name, bp.business_name, bp.address, wc.reminder_2h
    FROM appointments a
    LEFT JOIN clients c ON c.id = a.client_id
    JOIN business_profiles bp ON bp.user_id = a.user_id
    JOIN whatsapp_config wc ON wc.user_id = a.user_id
    WHERE a.date = CURRENT_DATE
      AND a.start_time BETWEEN NOW() + INTERVAL '1h 55m'
                           AND NOW() + INTERVAL '2h 5m'
      AND a.status IN ('Pendiente', 'Confirmada')
      AND wc.reminder_2h = true

  ↓

Node: Loop Over Items
  por cada cita:

    ↓

    Node: HTTP Request (WhatsApp API)
      template: vylta_recordatorio_2h
      parámetros:
        - {{business_name}}
        - {{start_time}}
        - {{address}} (si existe)
```

**Template WhatsApp:**
```
⏰ Tu cita en *{{1}}* es en 2 horas a las {{2}}.

{{3}}

¡Te esperamos!
```

---

## Variables de entorno en n8n

```
SUPABASE_URL=https://nhjmwmkaduiaifgztymi.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>  # NO la anon key
WHATSAPP_PHONE_NUMBER_ID=<id del número VYLTA en Meta>
WHATSAPP_ACCESS_TOKEN=<token permanente de Meta Business>
```

---

## Checklist de activación

- [ ] Chip AT&T registrado en Meta Business Suite
- [ ] Número VYLTA verificado como WhatsApp Business
- [ ] Templates `vylta_confirmacion`, `vylta_recordatorio_24h`, `vylta_recordatorio_2h` aprobados por Meta
- [ ] Variables de entorno configuradas en n8n Cloud
- [ ] Workflow 1 conectado a Supabase Webhook (tabla appointments, evento INSERT)
- [ ] Workflow 2 y 3 con cron activo
- [ ] Prueba end-to-end: crear cita de prueba y verificar que llega el WhatsApp
