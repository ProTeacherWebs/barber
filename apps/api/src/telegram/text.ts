export type StartPayload =
  | { kind: "booking"; token: string }
  | { kind: "barber"; code: string }
  | { kind: "none" };

export function parseStartPayload(payload: string): StartPayload {
  const value = payload.trim();
  if (/^b_[A-Za-z0-9_-]{20,80}$/.test(value)) return { kind: "booking", token: value.slice(2) };
  if (/^barber_[A-Za-z0-9_-]{8,40}$/.test(value)) return { kind: "barber", code: value.slice("barber_".length) };
  return { kind: "none" };
}

export function formatVisit(startsAt: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export function confirmationText(input: {
  services: string[];
  barberName: string;
  startsAt: Date | string;
}): string {
  return ["Запись в Кромке подтверждена.", input.services.join(", "), input.barberName, formatVisit(input.startsAt)].join("\n");
}

export function barberAlertText(input: {
  clientName: string;
  services: string[];
  startsAt: Date | string;
}): string {
  return ["Новая запись.", input.clientName, input.services.join(", "), formatVisit(input.startsAt)].join("\n");
}

export function cancelledText(input: { services: string[]; startsAt: Date | string }): string {
  return ["Запись отменена.", input.services.join(", "), formatVisit(input.startsAt)].join("\n");
}

export function rescheduledText(input: { services: string[]; from: Date | string; to: Date | string }): string {
  return ["Запись перенесена.", input.services.join(", "), `Было: ${formatVisit(input.from)}`, `Стало: ${formatVisit(input.to)}`].join("\n");
}

export function dayReminderText(input: { services: string[]; barberName: string; startsAt: Date | string }): string {
  return ["Напоминаем о записи в Кромке.", input.services.join(", "), input.barberName, formatVisit(input.startsAt)].join("\n");
}

export function shortReminderText(input: { services: string[]; barberName: string; startsAt: Date | string }): string {
  return ["Скоро ждём вас в Кромке.", input.services.join(", "), input.barberName, formatVisit(input.startsAt)].join("\n");
}

export function reviewRequestText(input: { services: string[]; barberName: string; startsAt: Date | string }): string {
  return ["Как прошёл визит в Кромке?", input.services.join(", "), input.barberName, formatVisit(input.startsAt), "Оцените от 1 до 5."].join("\n");
}
