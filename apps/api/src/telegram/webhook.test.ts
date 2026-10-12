import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";

describe("telegram webhook", () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const app = buildApp({ logger: false });

  beforeAll(() => {
    process.env.TELEGRAM_BOT_TOKEN = "";
    process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  });

  afterAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = previousToken;
    process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
    await app.close();
  });

  it("отклоняет чужой секрет", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      payload: { update_id: 1 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("отдаёт username бота", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/telegram/bot" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ username: process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null });
  });

  it("принимает пустой апдейт без токена бота", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "test-secret" },
      payload: { update_id: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
