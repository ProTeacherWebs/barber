import { addDays, formatMinutes, parseMinutes, todayIso, type ClockRange } from "./time.js";

export type SlotInput = {
  date: string;
  now: Date;
  durationMin: number;
  stepMin: number;
  minNoticeMin: number;
  horizonDays: number;
  working: ClockRange[];
  breaks: ClockRange[];
  timeOff: ClockRange[];
  bookings: ClockRange[];
};

export type SlotDenial = "TOO_SOON" | "TOO_FAR" | "SLOT_TAKEN" | "OUTSIDE_WORKING_HOURS";

export function totalDuration(minutes: number[]): number {
  return minutes.reduce((sum, value) => sum + value, 0);
}

export function mergeRanges(ranges: ClockRange[]): ClockRange[] {
  const sorted = ranges
    .filter((range) => range.endMin > range.startMin)
    .map((range) => ({ ...range }))
    .sort((left, right) => left.startMin - right.startMin);
  const merged: ClockRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range.startMin > last.endMin) merged.push(range);
    else last.endMin = Math.max(last.endMin, range.endMin);
  }
  return merged;
}

export function subtractRange(free: ClockRange[], cut: ClockRange): ClockRange[] {
  if (cut.endMin <= cut.startMin) return free;
  const next: ClockRange[] = [];
  for (const range of free) {
    if (cut.endMin <= range.startMin || cut.startMin >= range.endMin) {
      next.push(range);
      continue;
    }
    if (cut.startMin > range.startMin) next.push({ startMin: range.startMin, endMin: cut.startMin });
    if (cut.endMin < range.endMin) next.push({ startMin: cut.endMin, endMin: range.endMin });
  }
  return next;
}

export function openSlots(
  working: ClockRange[],
  cuts: ClockRange[],
  durationMin: number,
  stepMin: number,
): string[] {
  if (durationMin <= 0 || stepMin <= 0) return [];
  let free = mergeRanges(working);
  for (const cut of cuts) free = subtractRange(free, cut);
  const slots: string[] = [];
  for (const range of free) {
    const aligned = Math.ceil(range.startMin / stepMin) * stepMin;
    for (let start = aligned; start + durationMin <= range.endMin; start += stepMin) {
      slots.push(formatMinutes(start));
    }
  }
  return slots;
}

export function dateLimit(date: string, now: Date, horizonDays: number): "ok" | "TOO_SOON" | "TOO_FAR" {
  const today = todayIso(now);
  if (date < today) return "TOO_SOON";
  if (date > addDays(today, horizonDays)) return "TOO_FAR";
  return "ok";
}

export function visibleSlots(input: SlotInput): string[] {
  if (dateLimit(input.date, input.now, input.horizonDays) !== "ok") return [];
  const slots = openSlots(
    input.working,
    [...input.breaks, ...input.timeOff, ...input.bookings],
    input.durationMin,
    input.stepMin,
  );
  const earliest = input.now.getTime() + input.minNoticeMin * 60_000;
  const start = new Date(`${input.date}T00:00:00+05:00`).getTime();
  return slots.filter((slot) => start + parseMinutes(slot) * 60_000 >= earliest);
}

export function classifySlot(input: SlotInput, hhmm: string): "ok" | SlotDenial {
  const limit = dateLimit(input.date, input.now, input.horizonDays);
  if (limit !== "ok") return limit;
  const start = new Date(`${input.date}T00:00:00+05:00`).getTime() + parseMinutes(hhmm) * 60_000;
  if (start < input.now.getTime() + input.minNoticeMin * 60_000) return "TOO_SOON";
  const withBusy = openSlots(
    input.working,
    [...input.breaks, ...input.timeOff, ...input.bookings],
    input.durationMin,
    input.stepMin,
  );
  if (withBusy.includes(hhmm)) return "ok";
  const withoutBookings = openSlots(
    input.working,
    [...input.breaks, ...input.timeOff],
    input.durationMin,
    input.stepMin,
  );
  if (withoutBookings.includes(hhmm)) return "SLOT_TAKEN";
  return "OUTSIDE_WORKING_HOURS";
}
