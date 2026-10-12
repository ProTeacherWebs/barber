-- Захват напоминаний одним проходом. Повторный вызов не выбирает уже отмеченные записи.
CREATE OR REPLACE FUNCTION public.claim_notifications(p_now timestamptz DEFAULT now())
RETURNS TABLE (
  kind text,
  booking_id uuid,
  chat_id text,
  manage_token text,
  barber_name text,
  service_names text,
  starts_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  day_minutes int;
  short_minutes int;
  review_delay int;
BEGIN
  SELECT COALESCE((SELECT value::int FROM settings WHERE key = 'reminder_day_minutes'), 1440) INTO day_minutes;
  SELECT COALESCE((SELECT value::int FROM settings WHERE key = 'reminder_short_minutes'), 30) INTO short_minutes;
  SELECT COALESCE((SELECT value::int FROM settings WHERE key = 'review_delay_min'), 60) INTO review_delay;

  RETURN QUERY
  WITH done AS (
    UPDATE bookings AS booking
    SET status = 'completed', auto_completed_at = p_now
    WHERE booking.status = 'confirmed'
      AND (booking.ends_at AT TIME ZONE 'UTC') < p_now
      AND booking.auto_completed_at IS NULL
    RETURNING booking.id
  )
  SELECT
    'completed'::text,
    done.id,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::text,
    NULL::timestamptz
  FROM done;

  RETURN QUERY
  WITH due AS (
    SELECT booking.id
    FROM bookings AS booking
    JOIN clients AS client ON client.id = booking.client_id
    WHERE booking.status = 'confirmed'
      AND booking.reminder_day_sent_at IS NULL
      AND client.telegram_chat_id IS NOT NULL
      AND client.telegram_chat_id <> ''
      AND (booking.starts_at AT TIME ZONE 'UTC') > p_now + make_interval(mins => short_minutes)
      AND (booking.starts_at AT TIME ZONE 'UTC') <= p_now + make_interval(mins => day_minutes)
      AND (booking.created_at AT TIME ZONE 'UTC') <= (booking.starts_at AT TIME ZONE 'UTC') - make_interval(mins => day_minutes) + interval '30 minutes'
    FOR UPDATE OF booking SKIP LOCKED
  ),
  claimed AS (
    UPDATE bookings AS booking
    SET reminder_day_sent_at = p_now
    FROM due
    WHERE booking.id = due.id
    RETURNING booking.id, booking.manage_token, booking.starts_at, booking.client_id, booking.barber_id
  )
  SELECT
    'day'::text,
    claimed.id,
    client.telegram_chat_id,
    claimed.manage_token,
    barber.name,
    (SELECT string_agg(service.name, ', ' ORDER BY service.name) FROM booking_services AS service WHERE service.booking_id = claimed.id),
    claimed.starts_at AT TIME ZONE 'UTC'
  FROM claimed
  JOIN clients AS client ON client.id = claimed.client_id
  JOIN barbers AS barber ON barber.id = claimed.barber_id;

  RETURN QUERY
  WITH due AS (
    SELECT booking.id
    FROM bookings AS booking
    JOIN clients AS client ON client.id = booking.client_id
    WHERE booking.status = 'confirmed'
      AND booking.reminder_30m_sent_at IS NULL
      AND client.telegram_chat_id IS NOT NULL
      AND client.telegram_chat_id <> ''
      AND (booking.starts_at AT TIME ZONE 'UTC') > p_now - interval '10 minutes'
      AND (booking.starts_at AT TIME ZONE 'UTC') <= p_now + make_interval(mins => short_minutes)
    FOR UPDATE OF booking SKIP LOCKED
  ),
  claimed AS (
    UPDATE bookings AS booking
    SET reminder_30m_sent_at = p_now
    FROM due
    WHERE booking.id = due.id
    RETURNING booking.id, booking.manage_token, booking.starts_at, booking.client_id, booking.barber_id
  )
  SELECT
    'short'::text,
    claimed.id,
    client.telegram_chat_id,
    claimed.manage_token,
    barber.name,
    (SELECT string_agg(service.name, ', ' ORDER BY service.name) FROM booking_services AS service WHERE service.booking_id = claimed.id),
    claimed.starts_at AT TIME ZONE 'UTC'
  FROM claimed
  JOIN clients AS client ON client.id = claimed.client_id
  JOIN barbers AS barber ON barber.id = claimed.barber_id;

  RETURN QUERY
  WITH due AS (
    SELECT booking.id
    FROM bookings AS booking
    JOIN clients AS client ON client.id = booking.client_id
    WHERE booking.status = 'completed'
      AND booking.review_requested_at IS NULL
      AND client.telegram_chat_id IS NOT NULL
      AND client.telegram_chat_id <> ''
      AND (booking.ends_at AT TIME ZONE 'UTC') + make_interval(mins => review_delay) <= p_now
      AND NOT EXISTS (SELECT 1 FROM reviews AS review WHERE review.booking_id = booking.id)
    FOR UPDATE OF booking SKIP LOCKED
  ),
  claimed AS (
    UPDATE bookings AS booking
    SET review_requested_at = p_now
    FROM due
    WHERE booking.id = due.id
    RETURNING booking.id, booking.manage_token, booking.starts_at, booking.client_id, booking.barber_id
  )
  SELECT
    'review'::text,
    claimed.id,
    client.telegram_chat_id,
    claimed.manage_token,
    barber.name,
    (SELECT string_agg(service.name, ', ' ORDER BY service.name) FROM booking_services AS service WHERE service.booking_id = claimed.id),
    claimed.starts_at AT TIME ZONE 'UTC'
  FROM claimed
  JOIN clients AS client ON client.id = claimed.client_id
  JOIN barbers AS barber ON barber.id = claimed.barber_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_notification_claim(p_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kind = 'day' THEN
    UPDATE bookings SET reminder_day_sent_at = NULL WHERE id = p_id;
  ELSIF p_kind = 'short' THEN
    UPDATE bookings SET reminder_30m_sent_at = NULL WHERE id = p_id;
  ELSIF p_kind = 'review' THEN
    UPDATE bookings SET review_requested_at = NULL WHERE id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notifications(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_notification_claim(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notifications(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_notification_claim(uuid, text) TO service_role;
