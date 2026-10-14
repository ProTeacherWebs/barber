import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { ApiError, errorBody } from "./http";
import { prisma } from "./prisma";
import { registerAvailability } from "./routes/availability";
import { registerBarbers } from "./routes/barbers";
import { registerBookings } from "./routes/bookings";
import { registerHealth } from "./routes/health";
import { registerWebhook } from "./routes/webhook";
import { registerServices } from "./routes/services";
import { registerTelegram } from "./routes/telegram";
import { registerAdmin } from "./routes/admin";
import { registerAnalytics } from "./admin/analytics-routes";

export function buildApp(options?: { logger?: boolean }): FastifyInstance {
  return configureApp(Fastify({ logger: options?.logger ?? true }));
}

export function configureApp(app: FastifyInstance): FastifyInstance {
  const localOrigins = [
    "http://localhost:3000",
    "http://localhost:3010",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ];
  const configuredOrigins = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const origin = [...new Set([...configuredOrigins, ...localOrigins])];

  app.register(cors, {
    origin,
    credentials: true,
    allowedHeaders: ["content-type", "authorization"],
  });
  app.register(registerHealth);
  app.register(registerWebhook);
  app.register(
    async (api) => {
      registerServices(api);
      registerBarbers(api);
      registerAvailability(api);
      registerBookings(api);
      registerTelegram(api);
      await api.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 } });
      registerAdmin(api);
      registerAnalytics(api);
    },
    { prefix: "/api/v1" },
  );

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody("NOT_FOUND", "Маршрут не найден"));
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send(errorBody("VALIDATION", "Некорректные данные"));
    }
    if (error instanceof ApiError) {
      return reply.status(error.status).send(errorBody(error.code, error.message));
    }
    const statusCode =
      typeof error === "object" && error && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(errorBody("VALIDATION", "Некорректные данные"));
    }

    request.log.error(error);
    return reply.status(500).send(errorBody("INTERNAL", "Внутренняя ошибка"));
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
