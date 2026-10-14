import { Prisma, type PrismaClient } from "@prisma/client";
import { classifySlot, visibleSlots, type SlotInput } from "./slots.js";
import { clockFromDb, clipToDay, dayEnd, dayStart, weekdayOf } from "./time.js";

export type Settings = {
  slotStepMin: number;
  minNoticeMin: number;
  horizonDays: number;
  cancelCutoffMin: number;
};

export type QuoteLine = {
  serviceId: string;
  name: string;
  durationMin: number;
  price: number;
};

type Db = PrismaClient | Prisma.TransactionClient;

const settingDefaults: Settings = {
  slotStepMin: 15,
  minNoticeMin: 30,
  horizonDays: 30,
  cancelCutoffMin: 30,
};

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.setting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = (key: string, fallback: number) => {
    const value = Number(map.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    slotStepMin: read("slot_step_min", settingDefaults.slotStepMin),
    minNoticeMin: read("min_notice_min", settingDefaults.minNoticeMin),
    horizonDays: read("booking_horizon_days", settingDefaults.horizonDays),
    cancelCutoffMin: read("cancel_cutoff_min", settingDefaults.cancelCutoffMin),
  };
}

export function quoteLines(
  links: Array<{
    serviceId: string;
    durationMin: number | null;
    price: number | null;
    isEnabled: boolean;
    service: { name: string; durationMin: number; price: number; isActive: boolean };
  }>,
  serviceIds: string[],
): QuoteLine[] | null {
  const lines: QuoteLine[] = [];
  for (const serviceId of serviceIds) {
    const link = links.find((item) => item.serviceId === serviceId);
    if (!link?.isEnabled || !link.service.isActive) return null;
    lines.push({
      serviceId,
      name: link.service.name,
      durationMin: link.durationMin ?? link.service.durationMin,
      price: link.price ?? link.service.price,
    });
  }
  return lines;
}

export async function loadBarbers(
  db: Db,
  input: {
    serviceIds: string[];
    barberId?: string;
    from: string;
    to: string;
    excludeBookingId?: string;
  },
) {
  const rangeStart = dayStart(input.from);
  const rangeEnd = dayEnd(input.to);
  const barbers = await db.barber.findMany({
    where: {
      isActive: true,
      ...(input.barberId ? { id: input.barberId } : {}),
      AND: input.serviceIds.map((serviceId) => ({
        services: {
          some: { serviceId, isEnabled: true, service: { isActive: true } },
        },
      })),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: { serviceId: { in: input.serviceIds } },
        include: { service: true },
      },
      workingHours: true,
      breaks: true,
    },
  });
  const ids = barbers.map((barber) => barber.id);
  const [timeOff, bookings] = await Promise.all([
    db.timeOff.findMany({
      where: {
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        OR: [{ barberId: null }, { barberId: { in: ids } }],
      },
    }),
    db.booking.findMany({
      where: {
        status: "confirmed",
        barberId: { in: ids },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
      },
    }),
  ]);
  return { barbers, timeOff, bookings };
}

export function slotInputFor(
  barber: Awaited<ReturnType<typeof loadBarbers>>["barbers"][number],
  timeOff: Awaited<ReturnType<typeof loadBarbers>>["timeOff"],
  bookings: Awaited<ReturnType<typeof loadBarbers>>["bookings"],
  date: string,
  settings: Settings,
  now: Date,
): SlotInput | null {
  const lines = quoteLines(barber.services, barber.services.map((link) => link.serviceId));
  if (!lines) return null;
  const weekday = weekdayOf(date);
  return {
    date,
    now,
    durationMin: lines.reduce((sum, line) => sum + line.durationMin, 0),
    stepMin: settings.slotStepMin,
    minNoticeMin: settings.minNoticeMin,
    horizonDays: settings.horizonDays,
    working: barber.workingHours
      .filter((row) => row.weekday === weekday)
      .map((row) => ({ startMin: clockFromDb(row.startTime), endMin: clockFromDb(row.endTime) })),
    breaks: barber.breaks
      .filter((row) => row.weekday === weekday)
      .map((row) => ({ startMin: clockFromDb(row.startTime), endMin: clockFromDb(row.endTime) })),
    timeOff: timeOff
      .filter((row) => row.barberId === null || row.barberId === barber.id)
      .map((row) => clipToDay(date, row.startsAt, row.endsAt))
      .filter((row): row is NonNullable<typeof row> => row !== null),
    bookings: bookings
      .filter((row) => row.barberId === barber.id)
      .map((row) => clipToDay(date, row.startsAt, row.endsAt))
      .filter((row): row is NonNullable<typeof row> => row !== null),
  };
}

export function slotsForBarber(
  barber: Awaited<ReturnType<typeof loadBarbers>>["barbers"][number],
  timeOff: Awaited<ReturnType<typeof loadBarbers>>["timeOff"],
  bookings: Awaited<ReturnType<typeof loadBarbers>>["bookings"],
  serviceIds: string[],
  date: string,
  settings: Settings,
  now: Date,
): string[] {
  const lines = quoteLines(barber.services, serviceIds);
  const base = slotInputFor(barber, timeOff, bookings, date, settings, now);
  if (!lines || !base) return [];
  return visibleSlots({
    ...base,
    durationMin: lines.reduce((sum, line) => sum + line.durationMin, 0),
  });
}

export function explainSlot(
  barber: Awaited<ReturnType<typeof loadBarbers>>["barbers"][number],
  timeOff: Awaited<ReturnType<typeof loadBarbers>>["timeOff"],
  bookings: Awaited<ReturnType<typeof loadBarbers>>["bookings"],
  serviceIds: string[],
  date: string,
  hhmm: string,
  settings: Settings,
  now: Date,
) {
  const lines = quoteLines(barber.services, serviceIds);
  const base = slotInputFor(barber, timeOff, bookings, date, settings, now);
  if (!lines || !base) return "OUTSIDE_WORKING_HOURS" as const;
  return classifySlot(
    { ...base, durationMin: lines.reduce((sum, line) => sum + line.durationMin, 0) },
    hhmm,
  );
}
