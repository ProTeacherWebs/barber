import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "../http.js";

const MAX_AGE_SEC = 60 * 60 * 24;

export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
};

export function verifyInitData(initData: string, botToken: string, now = Date.now()): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new ApiError(401, "UNAUTHORIZED", "Нет подписи Telegram");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const left = Buffer.from(computed, "hex");
  const right = Buffer.from(hash, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError(401, "UNAUTHORIZED", "Подпись Telegram не совпала");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > MAX_AGE_SEC) {
    throw new ApiError(401, "UNAUTHORIZED", "Сессия Telegram устарела");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new ApiError(401, "UNAUTHORIZED", "В Telegram нет пользователя");
  const user = JSON.parse(rawUser) as TelegramUser;
  if (!user.id || !user.first_name) throw new ApiError(401, "UNAUTHORIZED", "В Telegram нет пользователя");
  return user;
}

export function resolveTelegramUser(initData: string, now = Date.now()): TelegramUser {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (!token) {
    if (initData === "dev") return { id: 10001, first_name: "Тест" };
    throw new ApiError(401, "UNAUTHORIZED", "Добавьте TELEGRAM_BOT_TOKEN");
  }
  return verifyInitData(initData, token, now);
}

export function telegramName(user: TelegramUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ");
}
