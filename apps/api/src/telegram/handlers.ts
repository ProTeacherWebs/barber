import { InlineKeyboard, Keyboard } from "grammy";
import { ApiError } from "../http.js";
import { cancelBooking, listMyBookings } from "../booking/service.js";
import { prisma } from "../prisma.js";
import { getBot } from "./client.js";
import { linkBarber, linkBookingClient } from "./link.js";
import { confirmationText, formatVisit, parseStartPayload } from "./text.js";

const APP_URL = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";
const MINIAPP_URL = () => process.env.MINIAPP_URL?.replace(/\/$/, "") ?? "";

function menu() {
  const keyboard = new Keyboard();
  const mini = MINIAPP_URL();
  if (mini) keyboard.webApp("Записаться", mini);
  else keyboard.text("Записаться");
  keyboard.text("Мои записи").resized();
  return keyboard;
}

function bookingKeyboard(token: string) {
  const keyboard = new InlineKeyboard().text("Отменить", `c:${token}`);
  const app = APP_URL();
  if (app) keyboard.url("Перенести", `${app}/booking/${token}`);
  return keyboard;
}

async function sendBookings(chatId: number, telegramId: string) {
  const bot = getBot();
  if (!bot) return;
  const client = await prisma.client.findUnique({ where: { telegramId } });
  if (!client) {
    await bot.api.sendMessage(chatId, "Записей пока нет. Откройте запись на сайте или в мини-приложении.");
    return;
  }
  const bookings = (await listMyBookings(prisma, client.id)).filter((booking) => booking.status === "confirmed");
  if (bookings.length === 0) {
    await bot.api.sendMessage(chatId, "Подтверждённых записей нет.");
    return;
  }
  for (const booking of bookings.slice(0, 10)) {
    await bot.api.sendMessage(
      chatId,
      [booking.services.map((service) => service.name).join(", "), booking.barber.name, formatVisit(booking.startsAt)].join("\n"),
      { reply_markup: bookingKeyboard(booking.manageToken) },
    );
  }
}

let handlersReady = false;

export function registerHandlers() {
  const bot = getBot();
  if (!bot || handlersReady) return;
  handlersReady = true;

  bot.command("start", async (ctx) => {
    if (!ctx.chat || !ctx.from) return;
    const payload = parseStartPayload(String(ctx.match ?? ""));
    const chatId = String(ctx.chat.id);
    const telegramId = String(ctx.from.id);

    if (payload.kind === "booking") {
      const linked = await linkBookingClient(prisma, { token: payload.token, telegramId, chatId });
      if (linked.status === "missing") {
        await ctx.reply("Запись не найдена.");
        return;
      }
      if (linked.status === "conflict") {
        await ctx.reply("Эта запись уже привязана к другому Telegram.");
        return;
      }
      const booking = await prisma.booking.findUnique({
        where: { id: linked.bookingId },
        include: { barber: true, services: true },
      });
      if (!booking) return;
      await ctx.reply(
        confirmationText({
          services: booking.services.map((service) => service.name),
          barberName: booking.barber.name,
          startsAt: booking.startsAt,
        }),
        { reply_markup: bookingKeyboard(payload.token) },
      );
      return;
    }

    if (payload.kind === "barber") {
      const linked = await linkBarber(prisma, { code: payload.code, chatId });
      await ctx.reply(linked.status === "linked" ? `Чат привязан к барберу ${linked.barberName}.` : "Ссылка уже использована или неверна.");
      return;
    }

    const mini = MINIAPP_URL();
    const app = APP_URL();
    const lines = ["Кромка. Барбершоп на улице Амира Темура.", "Здесь можно открыть запись и свои визиты."];
    if (!mini && app) lines.push(app);
    await ctx.reply(lines.join("\n"), { reply_markup: menu() });
  });

  bot.command("bookings", async (ctx) => {
    if (!ctx.chat || !ctx.from) return;
    await sendBookings(ctx.chat.id, String(ctx.from.id));
  });

  bot.hears("Мои записи", async (ctx) => {
    if (!ctx.chat || !ctx.from) return;
    await sendBookings(ctx.chat.id, String(ctx.from.id));
  });

  bot.hears("Записаться", async (ctx) => {
    const app = APP_URL();
    await ctx.reply(app ? `Запись: ${app}/book` : "Запись откроется в мини-приложении.");
  });

  bot.callbackQuery(/^c:([A-Za-z0-9_-]{20,80})$/, async (ctx) => {
    const token = ctx.match[1] ?? "";
    try {
      await cancelBooking(prisma, token);
      await ctx.answerCallbackQuery({ text: "Запись отменена" });
      await ctx.editMessageReplyMarkup();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Не удалось отменить";
      await ctx.answerCallbackQuery({ text: message, show_alert: true });
    }
  });

  bot.callbackQuery(/^r:([A-Za-z0-9_-]{20,80}):([1-5])$/, async (ctx) => {
    const token = ctx.match[1] ?? "";
    const rating = Number(ctx.match[2]);
    const booking = await prisma.booking.findUnique({
      where: { manageToken: token },
      include: { client: true },
    });
    const fromId = String(ctx.from.id);
    const owns =
      booking &&
      (booking.client.telegramId === fromId || booking.client.telegramChatId === fromId);
    if (!booking || !owns) {
      await ctx.answerCallbackQuery({ text: "Это не ваша запись", show_alert: true });
      return;
    }
    const existing = await prisma.review.findUnique({ where: { bookingId: booking.id } });
    if (existing) {
      await ctx.answerCallbackQuery({ text: "Отзыв уже сохранён" });
      return;
    }
    const setting = await prisma.setting.findUnique({ where: { key: "review_public_min_rating" } });
    const minPublic = Number(setting?.value ?? 4);
    await prisma.review.create({
      data: {
        bookingId: booking.id,
        barberId: booking.barberId,
        clientId: booking.clientId,
        rating,
        isPublic: rating >= (Number.isFinite(minPublic) ? minPublic : 4),
      },
    });
    await ctx.answerCallbackQuery({ text: "Спасибо за отзыв" });
    await ctx.editMessageReplyMarkup();
  });
}

export function setupBotMenu() {
  const bot = getBot();
  if (!bot) return;
  registerHandlers();
  void bot.api
    .setMyCommands([
      { command: "start", description: "Меню Кромки" },
      { command: "bookings", description: "Мои записи" },
    ])
    .catch((error: unknown) => {
      console.error("telegram commands", error instanceof Error ? error.message : error);
    });
  const mini = MINIAPP_URL();
  if (!mini) return;
  void bot.api
    .setChatMenuButton({
      menu_button: { type: "web_app", text: "Записаться", web_app: { url: mini } },
    })
    .catch((error: unknown) => {
      console.error("telegram menu", error instanceof Error ? error.message : error);
    });
}
