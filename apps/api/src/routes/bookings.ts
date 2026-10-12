import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cancelBooking, createBooking, getBooking, rescheduleBooking } from "../booking/service";
import { prisma } from "../prisma";
import { clientFromHeader } from "../telegram/session";

const tokenSchema = z.object({ token: z.string().min(20).max(80) });

const createSchema = z.object({
  serviceIds: z.array(z.string().uuid()).min(1),
  barberId: z.union([z.literal("any"), z.string().uuid()]),
  startsAt: z.string().datetime(),
  client: z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(9).max(20),
  }),
});

const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
});

export function registerBookings(app: FastifyInstance) {
  app.post("/bookings", async (request, reply) => {
    const body = createSchema.parse(request.body);
    const header = request.headers.authorization;
    const telegram = header
      ? await clientFromHeader(prisma, Array.isArray(header) ? header[0] : header)
      : null;
    const booking = await createBooking(prisma, {
      serviceIds: [...new Set(body.serviceIds)],
      barberId: body.barberId,
      startsAt: new Date(body.startsAt),
      name: body.client.name,
      phone: body.client.phone,
      telegramId: telegram?.client.telegramId ?? undefined,
      source: telegram ? "telegram" : "web",
    });
    return reply.status(201).send({ booking });
  });

  app.get("/bookings/:token", async (request) => {
    const { token } = tokenSchema.parse(request.params);
    return { booking: await getBooking(prisma, token) };
  });

  app.post("/bookings/:token/cancel", async (request) => {
    const { token } = tokenSchema.parse(request.params);
    return { booking: await cancelBooking(prisma, token) };
  });

  app.post("/bookings/:token/reschedule", async (request) => {
    const { token } = tokenSchema.parse(request.params);
    const body = rescheduleSchema.parse(request.body);
    return { booking: await rescheduleBooking(prisma, token, new Date(body.startsAt)) };
  });
}
