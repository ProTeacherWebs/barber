import { describe, expect, it } from "vitest";
import { buildAnalytics, type AnalyticsBooking } from "./analytics";

const aziz = "22222222-2222-4222-8222-222222222201";
const sardor = "22222222-2222-4222-8222-222222222206";

function at(iso: string) {
  return new Date(iso);
}

const bookings: AnalyticsBooking[] = [
  {
    clientId: "client-a",
    barberId: aziz,
    barberName: "Азиз",
    status: "completed",
    startsAt: at("2026-10-05T05:00:00.000Z"),
    totalPrice: 100_000,
    totalDurationMin: 45,
    services: [{ name: "Стрижка", price: 100_000 }],
  },
  {
    clientId: "client-a",
    barberId: aziz,
    barberName: "Азиз",
    status: "completed",
    startsAt: at("2026-10-06T06:00:00.000Z"),
    totalPrice: 80_000,
    totalDurationMin: 30,
    services: [{ name: "Борода", price: 80_000 }],
  },
  {
    clientId: "client-b",
    barberId: aziz,
    barberName: "Азиз",
    status: "cancelled",
    startsAt: at("2026-10-07T07:00:00.000Z"),
    totalPrice: 100_000,
    totalDurationMin: 45,
    services: [{ name: "Стрижка", price: 100_000 }],
  },
  {
    clientId: "client-b",
    barberId: sardor,
    barberName: "Сардор",
    status: "no_show",
    startsAt: at("2026-10-08T05:00:00.000Z"),
    totalPrice: 120_000,
    totalDurationMin: 45,
    services: [{ name: "Стрижка", price: 120_000 }],
  },
  {
    clientId: "client-c",
    barberId: sardor,
    barberName: "Сардор",
    status: "completed",
    startsAt: at("2026-10-05T05:00:00.000Z"),
    totalPrice: 100_000,
    totalDurationMin: 45,
    services: [{ name: "Стрижка", price: 100_000 }],
  },
];

describe("аналитика", () => {
  const report = buildAnalytics(bookings, new Set(["client-c"]));

  it("считает выручку и число записей только по завершённым визитам", () => {
    expect(report.revenue).toBe(280_000);
    expect(report.completedCount).toBe(3);
    expect(report.bookingCount).toBe(5);
  });

  it("собирает популярные услуги по завершённым визитам", () => {
    expect(report.services).toEqual([
      { name: "Стрижка", count: 2, revenue: 200_000 },
      { name: "Борода", count: 1, revenue: 80_000 },
    ]);
  });

  it("считает загрузку барберов в минутах и визитах", () => {
    expect(report.load).toEqual([
      { barberId: aziz, name: "Азиз", visits: 2, minutes: 75, revenue: 180_000 },
      { barberId: sardor, name: "Сардор", visits: 1, minutes: 45, revenue: 100_000 },
    ]);
  });

  it("считает отмены, неявки и возвращаемость", () => {
    expect(report.cancelled).toBe(1);
    expect(report.noShow).toBe(1);
    expect(report.cancelRate).toBe(0.2);
    expect(report.noShowRate).toBe(0.2);
    expect(report.clients).toBe(2);
    expect(report.returning).toBe(2);
    expect(report.retentionRate).toBe(1);
  });

  it("кладёт визиты в heatmap по ташкентскому дню и часу", () => {
    expect(report.heatmap).toEqual([
      { weekday: 1, hour: 10, count: 2 },
      { weekday: 2, hour: 11, count: 1 },
      { weekday: 3, hour: 12, count: 1 },
      { weekday: 4, hour: 10, count: 1 },
    ]);
  });
});
