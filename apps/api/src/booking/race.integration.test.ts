import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { prisma } from "../prisma";

const phone = `+99890${String(Date.now()).slice(-7)}`;
const serviceId = "11111111-1111-4111-8111-111111111101";
const barberId = "22222222-2222-4222-8222-222222222201";

describe("гонка записи", () => {
  const app = buildApp({ logger: false });

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { client: { phone } } });
    await prisma.client.deleteMany({ where: { phone } });
    await app.close();
  });

  it("два параллельных запроса на один слот дают 201 и 409", async () => {
    const days = await app.inject({
      method: "GET",
      url: `/api/v1/availability/days?serviceIds=${serviceId}&barberId=${barberId}`,
    });
    const available = (days.json().days as Array<{ date: string; available: boolean }>).find((day) => day.available);
    expect(available).toBeTruthy();

    const slots = await app.inject({
      method: "GET",
      url: `/api/v1/availability?serviceIds=${serviceId}&barberId=${barberId}&date=${available?.date}`,
    });
    const times = slots.json().slots as string[];
    expect(times.length).toBeGreaterThan(1);
    const [first, second] = times;

    const payload = (time: string) => ({
      serviceIds: [serviceId],
      barberId,
      startsAt: new Date(`${available?.date}T${time}:00+05:00`).toISOString(),
      client: { name: "Тест Гонка", phone },
    });

    const [left, right] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/bookings", payload: payload(first) }),
      app.inject({ method: "POST", url: "/api/v1/bookings", payload: payload(first) }),
    ]);
    expect([left.statusCode, right.statusCode].sort()).toEqual([201, 409]);
    const winner = left.statusCode === 201 ? left : right;
    expect(winner.json().code ?? winner.json().booking.manageToken).toBeTruthy();
    const taken = left.statusCode === 409 ? left : right;
    expect(taken.json().code).toBe("SLOT_TAKEN");

    const token = winner.json().booking.manageToken as string;
    const moved = await app.inject({
      method: "POST",
      url: `/api/v1/bookings/${token}/reschedule`,
      payload: { startsAt: new Date(`${available?.date}T${second}:00+05:00`).toISOString() },
    });
    expect(moved.statusCode).toBe(200);

    const cancelled = await app.inject({
      method: "POST",
      url: `/api/v1/bookings/${token}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().booking.status).toBe("cancelled");
  });
});
