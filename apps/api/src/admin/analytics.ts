export type AnalyticsStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export type AnalyticsBooking = {
  clientId: string;
  barberId: string;
  barberName: string;
  status: AnalyticsStatus;
  startsAt: Date;
  totalPrice: number;
  totalDurationMin: number;
  services: Array<{ name: string; price: number }>;
};

export type AnalyticsReport = {
  revenue: number;
  bookingCount: number;
  completedCount: number;
  services: Array<{ name: string; count: number; revenue: number }>;
  load: Array<{ barberId: string; name: string; visits: number; minutes: number; revenue: number }>;
  cancelled: number;
  noShow: number;
  cancelRate: number;
  noShowRate: number;
  clients: number;
  returning: number;
  retentionRate: number;
  heatmap: Array<{ weekday: number; hour: number; count: number }>;
};

function tashkentParts(value: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(read("weekday"));
  return { weekday, hour: Number(read("hour")) };
}

function rate(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 1000) / 1000;
}

export function buildAnalytics(bookings: AnalyticsBooking[], priorClientIds: ReadonlySet<string>): AnalyticsReport {
  const completed = bookings.filter((booking) => booking.status === "completed");
  const revenue = completed.reduce((sum, booking) => sum + booking.totalPrice, 0);

  const serviceMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const booking of completed) {
    for (const service of booking.services) {
      const current = serviceMap.get(service.name) ?? { name: service.name, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += service.price;
      serviceMap.set(service.name, current);
    }
  }

  const loadMap = new Map<string, { barberId: string; name: string; visits: number; minutes: number; revenue: number }>();
  for (const booking of completed) {
    const current = loadMap.get(booking.barberId) ?? {
      barberId: booking.barberId,
      name: booking.barberName,
      visits: 0,
      minutes: 0,
      revenue: 0,
    };
    current.visits += 1;
    current.minutes += booking.totalDurationMin;
    current.revenue += booking.totalPrice;
    loadMap.set(booking.barberId, current);
  }

  const completedByClient = new Map<string, number>();
  for (const booking of completed) {
    completedByClient.set(booking.clientId, (completedByClient.get(booking.clientId) ?? 0) + 1);
  }
  const clients = completedByClient.size;
  let returning = 0;
  for (const [clientId, count] of completedByClient) {
    if (count >= 2 || priorClientIds.has(clientId)) returning += 1;
  }

  const heat = new Map<string, { weekday: number; hour: number; count: number }>();
  for (const booking of bookings) {
    const slot = tashkentParts(booking.startsAt);
    const key = `${slot.weekday}-${slot.hour}`;
    const current = heat.get(key) ?? { weekday: slot.weekday, hour: slot.hour, count: 0 };
    current.count += 1;
    heat.set(key, current);
  }

  const cancelled = bookings.filter((booking) => booking.status === "cancelled").length;
  const noShow = bookings.filter((booking) => booking.status === "no_show").length;

  return {
    revenue,
    bookingCount: bookings.length,
    completedCount: completed.length,
    services: [...serviceMap.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru")),
    load: [...loadMap.values()].sort((left, right) => right.visits - left.visits || left.name.localeCompare(right.name, "ru")),
    cancelled,
    noShow,
    cancelRate: rate(cancelled, bookings.length),
    noShowRate: rate(noShow, bookings.length),
    clients,
    returning,
    retentionRate: rate(returning, clients),
    heatmap: [...heat.values()].sort((left, right) => left.weekday - right.weekday || left.hour - right.hour),
  };
}
