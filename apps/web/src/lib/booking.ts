import { apiUrl } from "@/lib/catalog";

export type DayAvailability = {
  date: string;
  available: boolean;
};

export type BookingView = {
  id: string;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  manageToken: string;
  barber: { id: string; name: string };
  services: Array<{ serviceId: string; name: string; durationMin: number; price: number }>;
  client: { name: string; phone: string };
};

export class BookingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const messages: Record<string, string> = {
  SLOT_TAKEN: "Это время уже занято. Выберите другое.",
  TOO_SOON: "Это время уже слишком близко.",
  TOO_FAR: "На эту дату ещё нельзя записаться.",
  OUTSIDE_WORKING_HOURS: "В это время барбершоп не работает.",
  TOO_LATE: "До визита осталось меньше 30 минут.",
  NOT_CONFIRMED: "Эту запись уже нельзя изменить.",
  VALIDATION: "Проверьте имя и телефон.",
};

async function read<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { code?: string; error?: { message?: string }; booking?: T } | null;
  if (!response.ok) {
    const code = body?.code ?? "INTERNAL";
    throw new BookingError(code, body?.error?.message ?? messages[code] ?? "Не удалось выполнить запрос.");
  }
  return body as T;
}

export function fetchDays(serviceIds: string[], barberId: string, token?: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId });
  if (token) params.set("token", token);
  return read<{ days: DayAvailability[] }>(`/api/v1/availability/days?${params}`).then((body) => body.days);
}

export function fetchSlots(serviceIds: string[], barberId: string, date: string, token?: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId, date });
  if (token) params.set("token", token);
  return read<{ slots: string[] }>(`/api/v1/availability?${params}`).then((body) => body.slots);
}

export function createBooking(input: {
  serviceIds: string[];
  barberId: string;
  startsAt: string;
  name: string;
  phone: string;
}) {
  return read<{ booking: BookingView }>("/api/v1/bookings", {
    method: "POST",
    body: JSON.stringify({
      serviceIds: input.serviceIds,
      barberId: input.barberId,
      startsAt: input.startsAt,
      client: { name: input.name, phone: input.phone },
    }),
  }).then((body) => body.booking);
}

export function fetchBooking(token: string) {
  return read<{ booking: BookingView }>(`/api/v1/bookings/${token}`).then((body) => body.booking);
}

export function cancelBooking(token: string) {
  return read<{ booking: BookingView }>(`/api/v1/bookings/${token}/cancel`, { method: "POST" }).then((body) => body.booking);
}

export function rescheduleBooking(token: string, startsAt: string) {
  return read<{ booking: BookingView }>(`/api/v1/bookings/${token}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ startsAt }),
  }).then((body) => body.booking);
}

export function bookingMessage(error: unknown): string {
  if (error instanceof BookingError) return messages[error.code] ?? error.message;
  return "Не удалось выполнить запрос.";
}
