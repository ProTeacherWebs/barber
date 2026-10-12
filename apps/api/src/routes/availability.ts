import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { bookingIdByToken, listDays, listSlots } from "../booking/service";
import { prisma } from "../prisma";

const querySchema = z.object({
  serviceIds: z.string().min(1),
  barberId: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  token: z.string().min(20).max(80).optional(),
});

function serviceIds(value: string) {
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  const parsed = z.array(z.string().uuid()).min(1).parse(ids);
  return [...new Set(parsed)];
}

function barberId(value: string | undefined) {
  if (!value || value === "any") return undefined;
  return z.string().uuid().parse(value);
}

export function registerAvailability(app: FastifyInstance) {
  app.get("/availability/days", async (request) => {
    const query = querySchema.parse(request.query);
    const excludeBookingId = query.token ? await bookingIdByToken(prisma, query.token) : undefined;
    return listDays(prisma, {
      serviceIds: serviceIds(query.serviceIds),
      barberId: barberId(query.barberId),
      excludeBookingId,
    });
  });

  app.get("/availability", async (request) => {
    const query = querySchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    const excludeBookingId = query.token ? await bookingIdByToken(prisma, query.token) : undefined;
    return listSlots(prisma, {
      serviceIds: serviceIds(query.serviceIds),
      barberId: barberId(query.barberId),
      date: query.date,
      excludeBookingId,
    });
  });
}
