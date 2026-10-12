import type { PrismaClient } from "@prisma/client";
import { getBot } from "./client";
import { barberAlertText, cancelledText, confirmationText, rescheduledText } from "./text";

async function send(chatId: string | null | undefined, text: string) {
  const bot = getBot();
  if (!bot || !chatId) return;
  try {
    await bot.api.sendMessage(chatId, text);
  } catch (error) {
    console.error("telegram send failed", error instanceof Error ? error.message : error);
  }
}

async function load(db: PrismaClient, id: string) {
  return db.booking.findUnique({
    where: { id },
    include: { client: true, barber: true, services: true },
  });
}

export async function notifyCreated(db: PrismaClient, id: string) {
  try {
    const booking = await load(db, id);
    if (!booking) return;
    const services = booking.services.map((service) => service.name);
    await send(
      booking.client.telegramChatId,
      confirmationText({ services, barberName: booking.barber.name, startsAt: booking.startsAt }),
    );
    await send(
      booking.barber.telegramChatId,
      barberAlertText({ clientName: booking.client.name, services, startsAt: booking.startsAt }),
    );
  } catch (error) {
    console.error("telegram notify created", error instanceof Error ? error.message : error);
  }
}

export async function notifyCancelled(db: PrismaClient, id: string) {
  try {
    const booking = await load(db, id);
    if (!booking) return;
    await send(
      booking.client.telegramChatId,
      cancelledText({ services: booking.services.map((service) => service.name), startsAt: booking.startsAt }),
    );
  } catch (error) {
    console.error("telegram notify cancelled", error instanceof Error ? error.message : error);
  }
}

export async function notifyRescheduled(db: PrismaClient, id: string, from: Date) {
  try {
    const booking = await load(db, id);
    if (!booking) return;
    await send(
      booking.client.telegramChatId,
      rescheduledText({
        services: booking.services.map((service) => service.name),
        from,
        to: booking.startsAt,
      }),
    );
  } catch (error) {
    console.error("telegram notify rescheduled", error instanceof Error ? error.message : error);
  }
}
