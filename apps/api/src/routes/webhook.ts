import type { FastifyInstance } from "fastify";
import type { Bot } from "grammy";
import { getBot } from "../telegram/client.js";
import { registerHandlers } from "../telegram/handlers.js";

export function registerWebhook(app: FastifyInstance) {
  app.post("/telegram/webhook", async (request, reply) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
    const header = request.headers["x-telegram-bot-api-secret-token"];
    if (secret && header !== secret) return reply.status(401).send({ ok: false });

    const bot = getBot();
    if (!bot) return reply.send({ ok: true });
    registerHandlers();
    try {
      await bot.handleUpdate(request.body as Parameters<Bot["handleUpdate"]>[0]);
    } catch (error) {
      request.log.error(error);
    }
    return reply.send({ ok: true });
  });
}
