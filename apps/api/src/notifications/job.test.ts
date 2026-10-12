import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

const serviceId = "11111111-1111-4111-8111-111111111101";
const barberId = "22222222-2222-4222-8222-222222222206";

type Tx = Prisma.TransactionClient;

async function person(tx: Tx) {
  return tx.client.create({
    data: {
      name: "Тест Напоминание",
      phone: `+99891${randomBytes(3).toString("hex").slice(0, 7)}`,
      telegramId: `remind-${randomBytes(4).toString("hex")}`,
      telegramChatId: "10001",
    },
  });
}

async function freeRange(tx: Tx, startsAt: Date, endsAt: Date) {
  const clash = await tx.booking.count({
    where: {
      barberId,
      status: "confirmed",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
  });
  return clash === 0;
}

async function visit(
  tx: Tx,
  input: { startsAt: Date; endsAt: Date; createdAt: Date; status?: "confirmed" | "completed" },
) {
  const owner = await person(tx);
  return tx.booking.create({
    data: {
      clientId: owner.id,
      barberId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: input.createdAt,
      totalPrice: 1000,
      totalDurationMin: 45,
      status: input.status ?? "confirmed",
      source: "web",
      manageToken: randomBytes(24).toString("base64url"),
      services: { create: [{ serviceId, name: "Мужская стрижка", durationMin: 45, price: 1000 }] },
    },
  });
}

async function kinds(tx: Tx, now: Date, id: string) {
  return tx.$queryRaw<Array<{ kind: string }>>`
    SELECT kind FROM claim_notifications(${now}::timestamptz) WHERE booking_id = ${id}::uuid
  `;
}

describe("напоминания", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function rollback(run: (tx: Tx) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new Error("ROLLBACK");
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      if (error instanceof Error && error.message === "ROLLBACK") return;
      throw error;
    }
  }

  it("напоминание за день берётся один раз", async () => {
    await rollback(async (tx) => {
      const now = new Date();
      let startsAt = new Date(now.getTime() + 20 * 60 * 60 * 1000);
      let endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      for (let step = 0; step < 8 && !(await freeRange(tx, startsAt, endsAt)); step += 1) {
        startsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
        endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      }
      const row = await visit(tx, {
        startsAt,
        endsAt,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      });
      const first = await kinds(tx, now, row.id);
      const second = await kinds(tx, now, row.id);
      expect(first.map((item) => item.kind)).toEqual(["day"]);
      expect(second).toEqual([]);
      const saved = await tx.booking.findUniqueOrThrow({ where: { id: row.id } });
      expect(saved.reminderDaySentAt).toBeTruthy();
    });
  });

  it("свежая запись ближе суток не получает дневное напоминание", async () => {
    await rollback(async (tx) => {
      const now = new Date();
      const startsAt = new Date(now.getTime() + 10 * 60 * 60 * 1000);
      const row = await visit(tx, {
        startsAt,
        endsAt: new Date(startsAt.getTime() + 45 * 60 * 1000),
        createdAt: now,
      });
      expect(await kinds(tx, now, row.id)).toEqual([]);
    });
  });

  it("за 30 минут отмечает reminder_30m_sent_at один раз", async () => {
    await rollback(async (tx) => {
      const now = new Date();
      let startsAt = new Date(now.getTime() + 12 * 60 * 1000);
      let endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      for (let step = 0; step < 10 && !(await freeRange(tx, startsAt, endsAt)); step += 1) {
        startsAt = new Date(startsAt.getTime() + 60 * 1000);
        endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
      }
      const row = await visit(tx, { startsAt, endsAt, createdAt: now });
      const first = await kinds(tx, now, row.id);
      const second = await kinds(tx, now, row.id);
      expect(first.map((item) => item.kind)).toEqual(["short"]);
      expect(second).toEqual([]);
      const saved = await tx.booking.findUniqueOrThrow({ where: { id: row.id } });
      expect(saved.reminder30mSentAt).toBeTruthy();
    });
  });

  it("завершает прошедший визит и один раз просит отзыв", async () => {
    await rollback(async (tx) => {
      const now = new Date();
      let endsAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      let startsAt = new Date(endsAt.getTime() - 45 * 60 * 1000);
      for (let step = 0; step < 6 && !(await freeRange(tx, startsAt, endsAt)); step += 1) {
        endsAt = new Date(endsAt.getTime() - 60 * 60 * 1000);
        startsAt = new Date(endsAt.getTime() - 45 * 60 * 1000);
      }
      const row = await visit(tx, {
        startsAt,
        endsAt,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      });
      const first = await kinds(tx, now, row.id);
      const second = await kinds(tx, now, row.id);
      expect(first.map((item) => item.kind).sort()).toEqual(["completed", "review"]);
      expect(second).toEqual([]);
      const saved = await tx.booking.findUniqueOrThrow({ where: { id: row.id } });
      expect(saved.status).toBe("completed");
      expect(saved.autoCompletedAt).toBeTruthy();
      expect(saved.reviewRequestedAt).toBeTruthy();
    });
  });
});
