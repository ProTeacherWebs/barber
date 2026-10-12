import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dayEnd, dayStart } from "../booking/time";
import { ApiError } from "../http";
import { prisma } from "../prisma";
import { buildAnalytics, type AnalyticsBooking } from "./analytics";
import { requireAdmin } from "./session";

const periodSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function loadAnalytics(db: PrismaClient, from: string, to: string) {
  if (from > to) throw new ApiError(422, "VALIDATION", "Начало периода позже конца");
  const start = dayStart(from);
  const end = dayEnd(to);
  if (end.getTime() - start.getTime() > 370 * 86_400_000) {
    throw new ApiError(422, "VALIDATION", "Период не длиннее года");
  }

  const rows = await db.booking.findMany({
    where: { startsAt: { gte: start, lt: end } },
    include: { services: true, barber: { select: { id: true, name: true } } },
  });
  const mapped: AnalyticsBooking[] = rows.map((row) => ({
    clientId: row.clientId,
    barberId: row.barberId,
    barberName: row.barber.name,
    status: row.status,
    startsAt: row.startsAt,
    totalPrice: row.totalPrice,
    totalDurationMin: row.totalDurationMin,
    services: row.services.map((service) => ({ name: service.name, price: service.price })),
  }));
  const clientIds = [...new Set(mapped.filter((row) => row.status === "completed").map((row) => row.clientId))];
  const prior = clientIds.length
    ? await db.booking.findMany({
        where: { status: "completed", startsAt: { lt: start }, clientId: { in: clientIds } },
        select: { clientId: true },
        distinct: ["clientId"],
      })
    : [];
  return buildAnalytics(mapped, new Set(prior.map((row) => row.clientId)));
}

export function registerAnalytics(app: FastifyInstance) {
  app.get("/admin/analytics/revenue", async (request) => {
    await requireAdmin(request);
    const report = await reportOf(request.query);
    return { revenue: report.revenue, bookingCount: report.bookingCount, completedCount: report.completedCount };
  });

  app.get("/admin/analytics/services", async (request) => {
    await requireAdmin(request);
    return { services: (await reportOf(request.query)).services };
  });

  app.get("/admin/analytics/load", async (request) => {
    await requireAdmin(request);
    return { barbers: (await reportOf(request.query)).load };
  });

  app.get("/admin/analytics/heatmap", async (request) => {
    await requireAdmin(request);
    return { cells: (await reportOf(request.query)).heatmap };
  });

  app.get("/admin/analytics/cancellations", async (request) => {
    await requireAdmin(request);
    const report = await reportOf(request.query);
    return {
      cancelled: report.cancelled,
      noShow: report.noShow,
      total: report.bookingCount,
      cancelRate: report.cancelRate,
      noShowRate: report.noShowRate,
    };
  });

  app.get("/admin/analytics/retention", async (request) => {
    await requireAdmin(request);
    const report = await reportOf(request.query);
    return { clients: report.clients, returning: report.returning, rate: report.retentionRate };
  });
}

async function reportOf(query: unknown) {
  const period = periodSchema.parse(query);
  return loadAnalytics(prisma, period.from, period.to);
}
