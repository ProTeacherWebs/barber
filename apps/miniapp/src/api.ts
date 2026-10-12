export type Service = {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
};

export type Barber = {
  id: string;
  name: string;
  bio: string;
  experienceYears: number;
  photoUrl: string;
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

export type ClientProfile = {
  id: string;
  name: string;
  phone: string;
  telegramId: string | null;
};

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

let initData = "";

export function setInitData(value: string) {
  initData = value;
}

const messages: Record<string, string> = {
  SLOT_TAKEN: "Это время уже занято. Выберите другое.",
  TOO_SOON: "Это время уже слишком близко.",
  TOO_FAR: "На эту дату ещё нельзя записаться.",
  OUTSIDE_WORKING_HOURS: "В это время барбершоп не работает.",
  TOO_LATE: "До визита осталось меньше 30 минут.",
  NOT_CONFIRMED: "Эту запись уже нельзя изменить.",
  PHONE_TAKEN: "Этот телефон уже привязан к другому Telegram.",
  UNAUTHORIZED: "Откройте мини-приложение в Telegram.",
  VALIDATION: "Проверьте имя и телефон.",
};

function apiPath(path: string): string {
  const origin = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  return origin ? `${origin}${path}` : path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(initData ? { authorization: `tma ${initData}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as { code?: string; error?: { message?: string } } | null;
  if (!response.ok) {
    const code = body?.code ?? "INTERNAL";
    throw new ApiError(code, body?.error?.message ?? messages[code] ?? "Не удалось выполнить запрос.");
  }
  return body as T;
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return messages[error.code] ?? error.message;
  return "Не удалось выполнить запрос.";
}

export function isCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

export async function auth() {
  const body = await request<{ client: ClientProfile }>("/api/v1/telegram/auth", { method: "POST", body: "{}" });
  return body.client;
}

export async function getServices() {
  const body = await request<{ services: Service[] }>("/api/v1/services");
  return body.services;
}

export async function getBarbers() {
  const body = await request<{ barbers: Barber[] }>("/api/v1/barbers");
  return body.barbers;
}

export async function getDays(serviceIds: string[], barberId: string, token?: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId });
  if (token) params.set("token", token);
  const body = await request<{ days: Array<{ date: string; available: boolean }> }>(`/api/v1/availability/days?${params}`);
  return body.days;
}

export async function getSlots(serviceIds: string[], barberId: string, date: string, token?: string) {
  const params = new URLSearchParams({ serviceIds: serviceIds.join(","), barberId, date });
  if (token) params.set("token", token);
  const body = await request<{ slots: string[] }>(`/api/v1/availability?${params}`);
  return body.slots;
}

export async function createVisit(input: {
  serviceIds: string[];
  barberId: string;
  startsAt: string;
  name: string;
  phone: string;
}) {
  const body = await request<{ booking: BookingView }>("/api/v1/bookings", {
    method: "POST",
    body: JSON.stringify({
      serviceIds: input.serviceIds,
      barberId: input.barberId,
      startsAt: input.startsAt,
      client: { name: input.name, phone: input.phone },
    }),
  });
  return body.booking;
}

export async function myBookings() {
  return request<{ bookings: BookingView[] }>("/api/v1/me/bookings");
}

export async function cancelVisit(token: string) {
  const body = await request<{ booking: BookingView }>(`/api/v1/bookings/${token}/cancel`, { method: "POST" });
  return body.booking;
}

export async function moveVisit(token: string, startsAt: string) {
  const body = await request<{ booking: BookingView }>(`/api/v1/bookings/${token}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ startsAt }),
  });
  return body.booking;
}
