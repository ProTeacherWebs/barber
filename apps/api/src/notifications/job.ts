import { GrammyError, InlineKeyboard } from "grammy";
import type { PrismaClient } from "@prisma/client";
import { getBot } from "../telegram/client";
import { dayReminderText, reviewRequestText, shortReminderText } from "../telegram/text";

export type ClaimKind = "completed" | "day" | "short" | "review";

export type ClaimRow = {
  kind: ClaimKind;
  booking_id: string;
  chat_id: string | null;
  manage_token: string | null;
  barber_name: string | null;
  service_names: string | null;
  starts_at: Date | null;
};

export function reviewKeyboard(token: string) {
  const row = [1, 2, 3, 4, 5].map((rating) => InlineKeyboard.text(String(rating), `r:${token}:${rating}`));
  return InlineKeyboard.from([row]);
}

export async function claimNotifications(db: PrismaClient, now = new Date()) {
  return db.$queryRaw<ClaimRow[]>`SELECT * FROM claim_notifications(${now}::timestamptz)`;
}

export async function releaseNotificationClaim(db: PrismaClient, id: string, kind: string) {
  await db.$executeRaw`SELECT release_notification_claim(${id}::uuid, ${kind})`;
}

function textFor(row: ClaimRow): string {
  const input = {
    services: row.service_names ? row.service_names.split(", ") : [],
    barberName: row.barber_name ?? "",
    startsAt: row.starts_at ?? new Date(),
  };
  if (row.kind === "short") return shortReminderText(input);
  if (row.kind === "review") return reviewRequestText(input);
  return dayReminderText(input);
}

export async function runNotifications(db: PrismaClient, now = new Date()) {
  const rows = await claimNotifications(db, now);
  const bot = getBot();
  let sent = 0;
  let completed = 0;

  for (const row of rows) {
    if (row.kind === "completed") {
      completed += 1;
      continue;
    }
    if (!bot || !row.chat_id) {
      await releaseNotificationClaim(db, row.booking_id, row.kind);
      continue;
    }
    try {
      await bot.api.sendMessage(row.chat_id, textFor(row), {
        reply_markup: row.kind === "review" && row.manage_token ? reviewKeyboard(row.manage_token) : undefined,
      });
      sent += 1;
    } catch (error) {
      const blocked = error instanceof GrammyError && error.error_code === 403;
      if (!blocked) await releaseNotificationClaim(db, row.booking_id, row.kind);
      console.error("notification send failed", error instanceof Error ? error.message : error);
    }
  }

  return { claimed: rows.length, sent, completed };
}
