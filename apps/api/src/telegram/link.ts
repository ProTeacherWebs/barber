import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "../http.js";
import { botUsername } from "./client.js";

export async function linkBookingClient(
  db: PrismaClient,
  input: { token: string; telegramId: string; chatId: string },
) {
  const booking = await db.booking.findUnique({
    where: { manageToken: input.token },
    include: { client: true },
  });
  if (!booking) return { status: "missing" as const };

  if (booking.client.telegramId && booking.client.telegramId !== input.telegramId) {
    return { status: "conflict" as const };
  }

  const existing = await db.client.findUnique({ where: { telegramId: input.telegramId } });
  if (existing && existing.id !== booking.client.id) {
    await db.booking.update({ where: { id: booking.id }, data: { clientId: existing.id } });
    await db.client.update({
      where: { id: existing.id },
      data: { telegramChatId: input.chatId },
    });
    return { status: "linked" as const, bookingId: booking.id };
  }

  await db.client.update({
    where: { id: booking.client.id },
    data: { telegramId: input.telegramId, telegramChatId: input.chatId },
  });
  return { status: "linked" as const, bookingId: booking.id };
}

export async function linkBarber(
  db: PrismaClient,
  input: { code: string; chatId: string },
) {
  const link = await db.barberLink.findUnique({ where: { code: input.code }, include: { barber: true } });
  if (!link || link.usedAt) return { status: "missing" as const };
  await db.barber.update({ where: { id: link.barberId }, data: { telegramChatId: input.chatId } });
  await db.barberLink.update({ where: { code: link.code }, data: { usedAt: new Date() } });
  return { status: "linked" as const, barberName: link.barber.name };
}

export async function createBarberLink(db: PrismaClient, barberId: string) {
  const barber = await db.barber.findUnique({ where: { id: barberId } });
  if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
  const code = randomBytes(9).toString("base64url");
  await db.barberLink.create({ data: { code, barberId } });
  const username = botUsername();
  const start = `barber_${code}`;
  return {
    code,
    barberName: barber.name,
    url: username ? `https://t.me/${username}?start=${start}` : null,
    start,
  };
}
