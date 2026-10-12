import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Claim = {
  kind: string;
  booking_id: string;
  chat_id: string | null;
  manage_token: string | null;
  barber_name: string | null;
  service_names: string | null;
  starts_at: string | null;
};

function formatVisit(startsAt: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function message(row: Claim): string {
  const services = row.service_names ?? "";
  const when = row.starts_at ? formatVisit(row.starts_at) : "";
  const lines = [services, row.barber_name ?? "", when].filter(Boolean);
  if (row.kind === "short") return ["Скоро ждём вас в Кромке.", ...lines].join("\n");
  if (row.kind === "review") return ["Как прошёл визит в Кромке?", ...lines, "Оцените от 1 до 5."].join("\n");
  return ["Напоминаем о записи в Кромке.", ...lines].join("\n");
}

function reviewKeyboard(token: string) {
  return {
    inline_keyboard: [[1, 2, 3, 4, 5].map((rating) => ({ text: String(rating), callback_data: `r:${token}:${rating}` }))],
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method", { status: 405 });

  const secret = Deno.env.get("CRON_SECRET")?.trim() ?? "";
  const header = request.headers.get("Authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const url = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim() ?? "";
  if (!url || !key) {
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const claimed = await db.rpc("claim_notifications");
  if (claimed.error) {
    console.error(claimed.error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const rows = (claimed.data ?? []) as Claim[];
  let sent = 0;
  let completed = 0;

  for (const row of rows) {
    if (row.kind === "completed") {
      completed += 1;
      continue;
    }
    if (!token || !row.chat_id) {
      await db.rpc("release_notification_claim", { p_id: row.booking_id, p_kind: row.kind });
      continue;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: row.chat_id,
        text: message(row),
        reply_markup: row.kind === "review" && row.manage_token ? reviewKeyboard(row.manage_token) : undefined,
      }),
    });
    const body = (await response.json()) as { ok?: boolean; error_code?: number; description?: string };
    if (!body.ok) {
      if (body.error_code !== 403) {
        await db.rpc("release_notification_claim", { p_id: row.booking_id, p_kind: row.kind });
      }
      console.error("telegram", body.description ?? response.status);
      continue;
    }
    sent += 1;
  }

  return new Response(JSON.stringify({ ok: true, sent, completed, claimed: rows.length }), {
    headers: { "content-type": "application/json" },
  });
});
