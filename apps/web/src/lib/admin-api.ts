export class AdminError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as { error?: { message?: string } }) : {};
  if (!response.ok) throw new AdminError(data.error?.message ?? "Не удалось выполнить запрос");
  return data as T;
}

export function tashkentDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function visitLabel(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function money(price: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(price)} сум`;
}
