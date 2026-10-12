export const TASHKENT_OFFSET = "+05:00";

export type ClockRange = {
  startMin: number;
  endMin: number;
};

export function todayIso(now: Date, timeZone = "Asia/Tashkent"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): number {
  return new Date(`${iso}T12:00:00${TASHKENT_OFFSET}`).getUTCDay();
}

export function dayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00${TASHKENT_OFFSET}`);
}

export function dayEnd(iso: string): Date {
  return new Date(dayStart(iso).getTime() + 86_400_000);
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function parseMinutes(hhmm: string): number {
  const [hours, mins] = hhmm.split(":").map(Number);
  return hours * 60 + mins;
}

export function clockFromDb(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function tashkentParts(value: Date): { date: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour") === "24" ? "00" : read("hour");
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hhmm: `${hour}:${read("minute")}`,
  };
}

export function clipToDay(date: string, startsAt: Date, endsAt: Date): ClockRange | null {
  const start = Math.max(startsAt.getTime(), dayStart(date).getTime());
  const end = Math.min(endsAt.getTime(), dayEnd(date).getTime());
  if (end <= start) return null;
  return {
    startMin: Math.floor((start - dayStart(date).getTime()) / 60_000),
    endMin: Math.ceil((end - dayStart(date).getTime()) / 60_000),
  };
}

export function canCancel(startsAt: Date, now: Date, cutoffMin: number): boolean {
  return startsAt.getTime() - now.getTime() >= cutoffMin * 60_000;
}

export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 9 ? `998${digits}` : digits;
  if (!/^998\d{9}$/.test(local)) return null;
  return `+${local}`;
}
