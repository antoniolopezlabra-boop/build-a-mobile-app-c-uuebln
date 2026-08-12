-- Fix: notify_upcoming_appointments() fallaba ~28x/día con
-- SQLSTATE 42883 'operator does not exist: text = date'.
-- Causa: appointments.date y appointments.start_time son TEXT,
-- pero el WHERE los comparaba como date/time nativos.
-- Efecto: los recordatorios push de 10 min NUNCA se enviaban.
-- Fix: castear a.date::date y a.start_time::time (+ TO_CHAR(::time)).
-- Aplicado en prod 2026-08-12 vía Management API.

CREATE OR REPLACE FUNCTION public.notify_upcoming_appointments()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'extensions'
AS $function$
DECLARE
  v_internal_key   TEXT;
  v_service_role   TEXT;
  v_supabase_url   TEXT := 'https://nhjmwmkaduiaifgztymi.supabase.co';
  v_appointment    RECORD;
  v_client_name    TEXT;
  v_time_str       TEXT;
  v_notification_count INTEGER := 0;
BEGIN
  SELECT decrypted_secret INTO v_internal_key
  FROM vault.decrypted_secrets WHERE name = 'vylta_internal_key' LIMIT 1;

  SELECT decrypted_secret INTO v_service_role
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_internal_key IS NULL OR v_service_role IS NULL THEN
    RAISE WARNING '[notify_upcoming_appointments] Secrets no configurados en Vault';
    RETURN;
  END IF;

  FOR v_appointment IN
    SELECT a.id, a.user_id, a.client_name_temp, a.service_name, a.start_time,
           a.client_id, c.name AS client_full_name
    FROM appointments a
    LEFT JOIN clients c ON c.id = a.client_id
    WHERE a.date::date = (NOW() AT TIME ZONE 'America/Mexico_City')::date
      AND a.start_time::time >= ((NOW() AT TIME ZONE 'America/Mexico_City') + INTERVAL '9 minutes')::time
      AND a.start_time::time <= ((NOW() AT TIME ZONE 'America/Mexico_City') + INTERVAL '11 minutes')::time
      AND a.status IN ('Pendiente', 'Confirmada')
      AND a.reminder_10min_sent = false
  LOOP
    v_client_name := COALESCE(
      NULLIF(v_appointment.client_full_name, ''),
      NULLIF(v_appointment.client_name_temp, ''),
      'Cliente'
    );

    v_time_str := TO_CHAR(v_appointment.start_time::time, 'HH24:MI');

    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_role,
        'x-vylta-internal-key', v_internal_key
      ),
      body := jsonb_build_object(
        'userId', v_appointment.user_id,
        'title', '⏰ Tienes cita en 10 minutos',
        'body', v_client_name || ' - ' || v_appointment.service_name || ' a las ' || v_time_str,
        'data', jsonb_build_object('appointmentId', v_appointment.id, 'type', 'reminder')
      )
    );

    UPDATE appointments SET reminder_10min_sent = true WHERE id = v_appointment.id;
    v_notification_count := v_notification_count + 1;
  END LOOP;

  IF v_notification_count > 0 THEN
    RAISE NOTICE '[notify_upcoming_appointments] % notificaciones enviadas', v_notification_count;
  END IF;
END;
$function$
