import type { PrismaClient } from "@prisma/client";
import { ApiError } from "../http.js";
import { resolveTelegramUser, telegramName, type TelegramUser } from "./init-data.js";

export function readInitData(authorization: string | undefined): string {
  if (!authorization?.startsWith("tma ")) {
    throw new ApiError(401, "UNAUTHORIZED", "Откройте запись в Telegram");
  }
  return authorization.slice(4);
}

export async function ensureTelegramClient(db: PrismaClient, user: TelegramUser) {
  const telegramId = String(user.id);
  const name = telegramName(user);
  const existing = await db.client.findUnique({ where: { telegramId } });
  if (existing) {
    if (existing.telegramChatId) return existing;
    return db.client.update({ where: { id: existing.id }, data: { telegramChatId: telegramId } });
  }
  return db.client.create({
    data: { name, phone: "", telegramId, telegramChatId: telegramId },
  });
}

export async function clientFromHeader(db: PrismaClient, authorization: string | undefined) {
  const user = resolveTelegramUser(readInitData(authorization));
  const client = await ensureTelegramClient(db, user);
  return { user, client };
}
