import type { FastifyInstance, FastifyRequest } from "fastify";
import { clientFromHeader } from "../telegram/session";
import { listMyBookings } from "../booking/service";
import { prisma } from "../prisma";

function authorization(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  return Array.isArray(value) ? value[0] : value;
}

export function registerTelegram(app: FastifyInstance) {
  app.get("/telegram/bot", async () => ({
    username: process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null,
  }));

  app.post("/telegram/auth", async (request) => {
    const { client } = await clientFromHeader(prisma, authorization(request));
    return {
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        telegramId: client.telegramId,
      },
    };
  });

  app.get("/me/bookings", async (request) => {
    const { client } = await clientFromHeader(prisma, authorization(request));
    return {
      client: {
        id: client.id,
        name: client.name,
        phone: client.phone,
        telegramId: client.telegramId,
      },
      bookings: await listMyBookings(prisma, client.id),
    };
  });
}
