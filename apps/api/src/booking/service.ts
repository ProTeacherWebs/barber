import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError, isSlotTakenError } from "../http.js";
import { explainSlot, loadBarbers, loadSettings, quoteLines, slotsForBarber } from "./schedule.js";
import { addDays, canCancel, normalizePhone, tashkentParts, todayIso } from "./time.js";
import { notifyCancelled, notifyCreated, notifyRescheduled } from "../telegram/notify.js";

const denialMessage = {
  TOO_SOON: "Это время уже слишком близко.",
  TOO_FAR: "На эту дату ещё нельзя записаться.",
  SLOT_TAKEN: "Это время уже занято.",
  OUTSIDE_WORKING_HOURS: "В это время барбершоп не работает.",
} as const;

function denial(code: keyof typeof denialMessage): never {
  const status = code === "SLOT_TAKEN" ? 409 : 422;
  throw new ApiError(status, code, denialMessage[code]);
}

function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

async function context(
  db: PrismaClient,
  input: { serviceIds: string[]; barberId?: string; from: string; to: string; excludeBookingId?: string },
) {
  const settings = await loadSettings(db);
  const loaded = await loadBarbers(db, input);
  return { settings, ...loaded };
}

export async function listDays(
  db: PrismaClient,
  input: { serviceIds: string[]; barberId?: string; excludeBookingId?: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const settings = await loadSettings(db);
  const from = todayIso(now);
  const to = addDays(from, settings.horizonDays);
  const loaded = await loadBarbers(db, { ...input, from, to });
  return {
    days: eachDate(from, to).map((date) => ({
      date,
      available: loaded.barbers.some(
        (barber) =>
          slotsForBarber(barber, loaded.timeOff, loaded.bookings, input.serviceIds, date, settings, now).length > 0,
      ),
    })),
  };
}

export async function listSlots(
  db: PrismaClient,
  input: { serviceIds: string[]; barberId?: string; date: string; excludeBookingId?: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const loaded = await context(db, {
    serviceIds: input.serviceIds,
    barberId: input.barberId,
    from: input.date,
    to: input.date,
    excludeBookingId: input.excludeBookingId,
  });
  const slots = new Set<string>();
  for (const barber of loaded.barbers) {
    for (const slot of slotsForBarber(
      barber,
      loaded.timeOff,
      loaded.bookings,
      input.serviceIds,
      input.date,
      loaded.settings,
      now,
    )) {
      slots.add(slot);
    }
  }
  const durationMin = loaded.barbers
    .map((barber) => quoteLines(barber.services, input.serviceIds))
    .find((lines) => lines !== null)
    ?.reduce((sum, line) => sum + line.durationMin, 0) ?? 0;
  return { date: input.date, durationMin, slots: [...slots].sort() };
}

async function bookingView(db: PrismaClient, id: string) {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id },
    include: {
      barber: true,
      services: true,
      client: true,
    },
  });
  return {
    id: booking.id,
    status: booking.status,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    totalPrice: booking.totalPrice,
    totalDurationMin: booking.totalDurationMin,
    manageToken: booking.manageToken,
    barber: { id: booking.barber.id, name: booking.barber.name },
    services: booking.services.map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      durationMin: service.durationMin,
      price: service.price,
    })),
    client: { name: booking.client.name, phone: booking.client.phone },
  };
}

export async function createBooking(
  db: PrismaClient,
  input: {
    serviceIds: string[];
    barberId: string;
    startsAt: Date;
    name: string;
    phone: string;
    now?: Date;
    telegramId?: string;
    source?: "web" | "telegram" | "admin";
    ignoreNotice?: boolean;
  },
) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ApiError(422, "VALIDATION", "Введите телефон в формате +998 71 200 19 30");
  const now = input.now ?? new Date();
  const when = tashkentParts(input.startsAt);
  const barberFilter = input.barberId === "any" ? undefined : input.barberId;

  try {
    const created = await db.$transaction(async (tx) => {
      const loaded = await loadBarbers(tx, {
        serviceIds: input.serviceIds,
        barberId: barberFilter,
        from: when.date,
        to: when.date,
      });
      const settings = await loadSettings(tx);
      if (input.ignoreNotice) settings.minNoticeMin = 0;
      const chosen = loaded.barbers.find((barber) =>
        slotsForBarber(barber, loaded.timeOff, loaded.bookings, input.serviceIds, when.date, settings, now).includes(
          when.hhmm,
        ),
      );
      if (!chosen) {
        const sample = loaded.barbers[0];
        if (!sample) throw new ApiError(422, "OUTSIDE_WORKING_HOURS", denialMessage.OUTSIDE_WORKING_HOURS);
        const reason = explainSlot(
          sample,
          loaded.timeOff,
          loaded.bookings,
          input.serviceIds,
          when.date,
          when.hhmm,
          settings,
          now,
        );
        if (reason === "ok") throw new ApiError(409, "SLOT_TAKEN", denialMessage.SLOT_TAKEN);
        denial(reason);
      }
      const lines = quoteLines(chosen.services, input.serviceIds);
      if (!lines) throw new ApiError(422, "OUTSIDE_WORKING_HOURS", denialMessage.OUTSIDE_WORKING_HOURS);
      const durationMin = lines.reduce((sum, line) => sum + line.durationMin, 0);
      const client = await upsertClient(tx, {
        name: input.name,
        phone,
        telegramId: input.telegramId,
      });
      return tx.booking.create({
        data: {
          clientId: client.id,
          barberId: chosen.id,
          startsAt: input.startsAt,
          endsAt: new Date(input.startsAt.getTime() + durationMin * 60_000),
          totalPrice: lines.reduce((sum, line) => sum + line.price, 0),
          totalDurationMin: durationMin,
          status: "confirmed",
          source: input.source ?? "web",
          manageToken: randomBytes(24).toString("base64url"),
          services: {
            create: lines.map((line) => ({
              serviceId: line.serviceId,
              name: line.name,
              durationMin: line.durationMin,
              price: line.price,
            })),
          },
        },
      });
    }, { maxWait: 10_000, timeout: 20_000 });
    await notifyCreated(db, created.id);
    return bookingView(db, created.id);
  } catch (error) {
    if (isSlotTakenError(error)) throw new ApiError(409, "SLOT_TAKEN", denialMessage.SLOT_TAKEN);
    throw error;
  }
}

export async function getBooking(db: PrismaClient, token: string) {
  const booking = await db.booking.findUnique({ where: { manageToken: token } });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  return bookingView(db, booking.id);
}

export async function cancelBooking(db: PrismaClient, token: string, now = new Date()) {
  const booking = await db.booking.findUnique({ where: { manageToken: token } });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  if (booking.status !== "confirmed") {
    throw new ApiError(422, "NOT_CONFIRMED", "Эту запись уже нельзя отменить");
  }
  const settings = await loadSettings(db);
  if (!canCancel(booking.startsAt, now, settings.cancelCutoffMin)) {
    throw new ApiError(422, "TOO_LATE", `Отмена доступна не позднее чем за ${settings.cancelCutoffMin} минут`);
  }
  await db.booking.update({ where: { id: booking.id }, data: { status: "cancelled" } });
  await notifyCancelled(db, booking.id);
  return bookingView(db, booking.id);
}

export async function rescheduleBooking(
  db: PrismaClient,
  token: string,
  startsAt: Date,
  now = new Date(),
) {
  const booking = await db.booking.findUnique({
    where: { manageToken: token },
    include: { services: true },
  });
  if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
  if (booking.status !== "confirmed") {
    throw new ApiError(422, "NOT_CONFIRMED", "Эту запись уже нельзя перенести");
  }
  if (booking.startsAt.getTime() === startsAt.getTime()) return bookingView(db, booking.id);
  const previousStartsAt = booking.startsAt;
  const when = tashkentParts(startsAt);
  const serviceIds = booking.services.map((service) => service.serviceId);
  try {
    await db.$transaction(async (tx) => {
      const loaded = await loadBarbers(tx, {
        serviceIds,
        barberId: booking.barberId,
        from: when.date,
        to: when.date,
        excludeBookingId: booking.id,
      });
      const settings = await loadSettings(tx);
      const barber = loaded.barbers[0];
      if (!barber) throw new ApiError(422, "OUTSIDE_WORKING_HOURS", denialMessage.OUTSIDE_WORKING_HOURS);
      const slots = slotsForBarber(
        barber,
        loaded.timeOff,
        loaded.bookings,
        serviceIds,
        when.date,
        settings,
        now,
      );
      if (!slots.includes(when.hhmm)) {
        const reason = explainSlot(
          barber,
          loaded.timeOff,
          loaded.bookings,
          serviceIds,
          when.date,
          when.hhmm,
          settings,
          now,
        );
        if (reason === "ok") throw new ApiError(409, "SLOT_TAKEN", denialMessage.SLOT_TAKEN);
        denial(reason);
      }
      const lines = quoteLines(barber.services, serviceIds);
      if (!lines) throw new ApiError(422, "OUTSIDE_WORKING_HOURS", denialMessage.OUTSIDE_WORKING_HOURS);
      const durationMin = lines.reduce((sum, line) => sum + line.durationMin, 0);
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          startsAt,
          endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
          totalDurationMin: durationMin,
          totalPrice: lines.reduce((sum, line) => sum + line.price, 0),
        },
      });
    }, { maxWait: 10_000, timeout: 20_000 });
  } catch (error) {
    if (isSlotTakenError(error)) throw new ApiError(409, "SLOT_TAKEN", denialMessage.SLOT_TAKEN);
    throw error;
  }
  await notifyRescheduled(db, booking.id, previousStartsAt);
  return bookingView(db, booking.id);
}

export async function bookingIdByToken(db: PrismaClient, token: string) {
  const booking = await db.booking.findUnique({ where: { manageToken: token }, select: { id: true, status: true } });
  if (!booking || booking.status !== "confirmed") return undefined;
  return booking.id;
}

async function upsertClient(
  db: Prisma.TransactionClient,
  input: { name: string; phone: string; telegramId?: string },
) {
  if (input.telegramId) {
    const byTelegram = await db.client.findUnique({ where: { telegramId: input.telegramId } });
    if (byTelegram) {
      const other = await db.client.findFirst({
        where: { phone: input.phone, NOT: { id: byTelegram.id } },
      });
      if (other) throw new ApiError(422, "PHONE_TAKEN", "Этот телефон уже привязан к другому Telegram");
      return db.client.update({
        where: { id: byTelegram.id },
        data: { name: input.name, phone: input.phone },
      });
    }
  }

  const byPhone = await db.client.findFirst({ where: { phone: input.phone } });
  if (byPhone) {
    if (input.telegramId && byPhone.telegramId && byPhone.telegramId !== input.telegramId) {
      throw new ApiError(422, "PHONE_TAKEN", "Этот телефон уже привязан к другому Telegram");
    }
    return db.client.update({
      where: { id: byPhone.id },
      data: { name: input.name, ...(input.telegramId ? { telegramId: input.telegramId } : {}) },
    });
  }

  return db.client.create({
    data: { name: input.name, phone: input.phone, telegramId: input.telegramId },
  });
}

export async function listMyBookings(db: PrismaClient, clientId: string) {
  const rows = await db.booking.findMany({
    where: { clientId },
    orderBy: { startsAt: "desc" },
    select: { id: true },
  });
  return Promise.all(rows.map((row) => bookingView(db, row.id)));
}
