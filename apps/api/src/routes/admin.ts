import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { checkPassword, clearSessionCookie, closeSession, hashPassword, openSession, requireAdmin, setSessionCookie } from "../admin/session.js";
import { clearLoginLimit, loginLimited } from "../admin/rate-limit.js";
import { createBooking, rescheduleBooking } from "../booking/service.js";
import { notifyCancelled } from "../telegram/notify.js";
import { ApiError } from "../http.js";
import { prisma } from "../prisma.js";

const loginSchema = z.object({
  login: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

const idSchema = z.object({ id: z.string().uuid() });

const serviceBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional(),
  durationMin: z.number().int().min(15).max(240),
  price: z.number().int().min(0).max(10_000_000),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

const barberBody = z.object({
  name: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(400).optional(),
  experienceYears: z.number().int().min(0).max(60).optional(),
  photoUrl: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
});

const clock = z.string().regex(/^\d{2}:\d{2}$/);
const scheduleBody = z.object({
  hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: clock, end: clock })),
  breaks: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: clock, end: clock })),
});

const timeOffBody = z.object({
  barberId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  type: z.enum(["vacation", "sick", "closed", "exception"]),
  note: z.string().trim().max(200).optional(),
});

const bookingCreate = z.object({
  serviceIds: z.array(z.string().uuid()).min(1),
  barberId: z.string().uuid(),
  startsAt: z.string().datetime(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(7).max(30),
});

const bookingPatch = z.object({
  status: z.enum(["confirmed", "completed", "cancelled", "no_show"]).optional(),
  startsAt: z.string().datetime().optional(),
});

const settingKeys = [
  "cancel_cutoff_min",
  "slot_step_min",
  "booking_horizon_days",
  "min_notice_min",
  "reminder_day_minutes",
  "reminder_short_minutes",
  "review_delay_min",
  "timezone",
  "review_public_min_rating",
] as const;

function clockDate(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

function clockText(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function dayBound(iso: string, end: boolean) {
  return new Date(`${iso}T${end ? "23:59:59.999" : "00:00:00"}+05:00`);
}

async function replaceServices(db: Prisma.TransactionClient, barberId: string, serviceIds: string[]) {
  await db.barberService.deleteMany({ where: { barberId } });
  if (serviceIds.length === 0) return;
  await db.barberService.createMany({
    data: serviceIds.map((serviceId) => ({ barberId, serviceId, isEnabled: true })),
  });
}

export function registerAdmin(app: FastifyInstance) {
  app.post("/admin/login", async (request, reply) => {
    const ip = request.ip || "local";
    if (loginLimited(ip)) throw new ApiError(429, "RATE_LIMIT", "Слишком много попыток. Подождите 15 минут.");
    const body = loginSchema.parse(request.body);
    const admin = await prisma.adminUser.findUnique({ where: { login: body.login } });
    const matches = admin ? await checkPassword(body.password, admin.passwordHash) : false;
    if (!admin || !matches) throw new ApiError(401, "UNAUTHORIZED", "Неверный логин или пароль");
    if (admin.passwordHash.startsWith("$2")) {
      await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(body.password) } });
    }
    clearLoginLimit(ip);
    setSessionCookie(reply, await openSession(admin.id));
    return { admin: { id: admin.id, login: admin.login } };
  });

  app.post("/admin/logout", async (request, reply) => {
    await closeSession(request);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/admin/me", async (request) => {
    const admin = await requireAdmin(request);
    return { admin: { id: admin.id, login: admin.login } };
  });

  app.get("/admin/bookings", async (request) => {
    await requireAdmin(request);
    const query = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query);
    const rows = await prisma.booking.findMany({
      where: query.from || query.to ? { startsAt: { gte: query.from ? dayBound(query.from, false) : undefined, lte: query.to ? dayBound(query.to, true) : undefined } } : undefined,
      include: { client: true, barber: true, services: true },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    return {
      bookings: rows.map((row) => ({
        id: row.id,
        status: row.status,
        source: row.source,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        totalPrice: row.totalPrice,
        manageToken: row.manageToken,
        client: { name: row.client.name, phone: row.client.phone },
        barber: { id: row.barber.id, name: row.barber.name },
        services: row.services.map((service) => service.name),
      })),
    };
  });

  app.post("/admin/bookings", async (request) => {
    await requireAdmin(request);
    const body = bookingCreate.parse(request.body);
    const booking = await createBooking(prisma, {
      serviceIds: body.serviceIds,
      barberId: body.barberId,
      startsAt: new Date(body.startsAt),
      name: body.name,
      phone: body.phone,
      source: "admin",
      ignoreNotice: true,
    });
    return { booking };
  });

  app.patch("/admin/bookings/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = bookingPatch.parse(request.body);
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new ApiError(404, "NOT_FOUND", "Запись не найдена");
    if (body.startsAt) await rescheduleBooking(prisma, booking.manageToken, new Date(body.startsAt));
    if (body.status && body.status !== booking.status) {
      await prisma.booking.update({ where: { id }, data: { status: body.status } });
      if (body.status === "cancelled") await notifyCancelled(prisma, id);
    }
    return { booking: await view(prisma, id) };
  });

  app.get("/admin/services", async (request) => {
    await requireAdmin(request);
    const services = await prisma.service.findMany({ orderBy: { sortOrder: "asc" } });
    return { services };
  });

  app.post("/admin/services", async (request) => {
    await requireAdmin(request);
    const body = serviceBody.parse(request.body);
    const service = await prisma.service.create({
      data: {
        id: randomUUID(),
        name: body.name,
        description: body.description ?? "",
        durationMin: body.durationMin,
        price: body.price,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return { service };
  });

  app.patch("/admin/services/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = serviceBody.partial().parse(request.body);
    const service = await prisma.service.update({ where: { id }, data: body }).catch(() => null);
    if (!service) throw new ApiError(404, "NOT_FOUND", "Услуга не найдена");
    return { service };
  });

  app.delete("/admin/services/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    try {
      await prisma.service.delete({ where: { id } });
    } catch (error) {
      if (isFk(error)) throw new ApiError(409, "IN_USE", "Услуга уже есть в записях. Снимите её с публикации.");
      throw new ApiError(404, "NOT_FOUND", "Услуга не найдена");
    }
    return { ok: true };
  });

  app.get("/admin/barbers", async (request) => {
    await requireAdmin(request);
    const barbers = await prisma.barber.findMany({ orderBy: { sortOrder: "asc" } });
    return { barbers };
  });

  app.get("/admin/barbers/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const barber = await prisma.barber.findUnique({
      where: { id },
      include: { services: true, workingHours: true, breaks: true, portfolio: { orderBy: { sortOrder: "asc" } } },
    });
    if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    return {
      barber: {
        ...barber,
        workingHours: barber.workingHours.map((row) => ({ weekday: row.weekday, start: clockText(row.startTime), end: clockText(row.endTime) })),
        breaks: barber.breaks.map((row) => ({ weekday: row.weekday, start: clockText(row.startTime), end: clockText(row.endTime) })),
      },
    };
  });

  app.post("/admin/barbers", async (request) => {
    await requireAdmin(request);
    const body = barberBody.parse(request.body);
    const services = body.serviceIds ?? (await prisma.service.findMany({ where: { isActive: true }, select: { id: true } })).map((row) => row.id);
    const barber = await prisma.$transaction(async (tx) => {
      const created = await tx.barber.create({
        data: {
          id: randomUUID(),
          name: body.name,
          bio: body.bio ?? "",
          experienceYears: body.experienceYears ?? 0,
          photoUrl: body.photoUrl || "/images/master-1.jpg",
          isActive: body.isActive ?? true,
          sortOrder: body.sortOrder ?? 0,
        },
      });
      await replaceServices(tx, created.id, services);
      return created;
    });
    return { barber };
  });

  app.patch("/admin/barbers/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = barberBody.partial().parse(request.body);
    const barber = await prisma.$transaction(async (tx) => {
      const updated = await tx.barber.update({
        where: { id },
        data: {
          name: body.name,
          bio: body.bio,
          experienceYears: body.experienceYears,
          photoUrl: body.photoUrl,
          isActive: body.isActive,
          sortOrder: body.sortOrder,
        },
      }).catch(() => null);
      if (!updated) return null;
      if (body.serviceIds) await replaceServices(tx, id, body.serviceIds);
      return updated;
    });
    if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    return { barber };
  });

  app.delete("/admin/barbers/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    try {
      await prisma.barber.delete({ where: { id } });
    } catch (error) {
      if (isFk(error)) throw new ApiError(409, "IN_USE", "У барбера есть записи. Скройте его вместо удаления.");
      throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    }
    return { ok: true };
  });

  app.put("/admin/barbers/:id/schedule", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = scheduleBody.parse(request.body);
    const barber = await prisma.barber.findUnique({ where: { id } });
    if (!barber) throw new ApiError(404, "NOT_FOUND", "Барбер не найден");
    await prisma.$transaction(async (tx) => {
      await tx.workingHour.deleteMany({ where: { barberId: id } });
      await tx.break.deleteMany({ where: { barberId: id } });
      if (body.hours.length) {
        await tx.workingHour.createMany({
          data: body.hours.map((row) => ({ id: randomUUID(), barberId: id, weekday: row.weekday, startTime: clockDate(row.start), endTime: clockDate(row.end) })),
        });
      }
      if (body.breaks.length) {
        await tx.break.createMany({
          data: body.breaks.map((row) => ({ id: randomUUID(), barberId: id, weekday: row.weekday, startTime: clockDate(row.start), endTime: clockDate(row.end) })),
        });
      }
    });
    return { ok: true };
  });

  app.post("/admin/barbers/:id/portfolio", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = z.object({ imageUrl: z.string().trim().min(1).max(500) }).parse(request.body);
    const item = await prisma.portfolioItem.create({ data: { id: randomUUID(), barberId: id, imageUrl: body.imageUrl } });
    return { item };
  });

  app.delete("/admin/portfolio/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    await prisma.portfolioItem.delete({ where: { id } }).catch(() => {
      throw new ApiError(404, "NOT_FOUND", "Фото не найдено");
    });
    return { ok: true };
  });

  app.get("/admin/time-off", async (request) => {
    await requireAdmin(request);
    const rows = await prisma.timeOff.findMany({ include: { barber: true }, orderBy: { startsAt: "desc" }, take: 200 });
    return {
      items: rows.map((row) => ({
        id: row.id,
        barberId: row.barberId,
        barberName: row.barber?.name ?? "Весь барбершоп",
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        type: row.type,
        note: row.note,
      })),
    };
  });

  app.post("/admin/time-off", async (request) => {
    await requireAdmin(request);
    const body = timeOffBody.parse(request.body);
    const item = await prisma.timeOff.create({
      data: { id: randomUUID(), barberId: body.barberId ?? null, startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), type: body.type, note: body.note ?? "" },
    });
    return { item };
  });

  app.patch("/admin/time-off/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = timeOffBody.partial().parse(request.body);
    const item = await prisma.timeOff.update({
      where: { id },
      data: {
        barberId: body.barberId,
        startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
        endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
        type: body.type,
        note: body.note,
      },
    }).catch(() => null);
    if (!item) throw new ApiError(404, "NOT_FOUND", "Исключение не найдено");
    return { item };
  });

  app.delete("/admin/time-off/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    await prisma.timeOff.delete({ where: { id } }).catch(() => {
      throw new ApiError(404, "NOT_FOUND", "Исключение не найдено");
    });
    return { ok: true };
  });

  app.get("/admin/settings", async (request) => {
    await requireAdmin(request);
    const rows = await prisma.setting.findMany();
    return { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  });

  app.put("/admin/settings", async (request) => {
    await requireAdmin(request);
    const body = z.object({ settings: z.record(z.string(), z.string().max(80)) }).parse(request.body);
    for (const key of settingKeys) {
      const value = body.settings[key];
      if (value === undefined) continue;
      if (key !== "timezone" && !/^\d+$/.test(value)) throw new ApiError(422, "VALIDATION", `Поле ${key} должно быть числом`);
      await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    return { ok: true };
  });

  app.get("/admin/reviews", async (request) => {
    await requireAdmin(request);
    const rows = await prisma.review.findMany({
      include: { client: true, barber: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      reviews: rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        isPublic: row.isPublic,
        createdAt: row.createdAt.toISOString(),
        clientName: row.client.name,
        barberName: row.barber.name,
      })),
    };
  });

  app.patch("/admin/reviews/:id", async (request) => {
    await requireAdmin(request);
    const { id } = idSchema.parse(request.params);
    const body = z.object({ isPublic: z.boolean() }).parse(request.body);
    const review = await prisma.review.update({ where: { id }, data: { isPublic: body.isPublic } }).catch(() => null);
    if (!review) throw new ApiError(404, "NOT_FOUND", "Отзыв не найден");
    return { review: { id: review.id, isPublic: review.isPublic } };
  });

  app.post("/admin/uploads", async (request) => {
    await requireAdmin(request);
    const file = await request.file();
    if (!file) throw new ApiError(400, "VALIDATION", "Файл не выбран");
    const allowed: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = allowed[file.mimetype];
    if (!ext) throw new ApiError(422, "VALIDATION", "Нужен файл JPG, PNG или WebP");
    const bytes = await file.toBuffer();
    const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!base || !key) throw new ApiError(503, "STORAGE", "Хранилище не настроено");
    const headers = { authorization: `Bearer ${key}`, apikey: key };
    await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: "photos", name: "photos", public: true }),
    });
    const path = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const saved = await fetch(`${base}/storage/v1/object/photos/${path}`, {
      method: "POST",
      headers: { ...headers, "content-type": file.mimetype },
      body: bytes,
    });
    if (!saved.ok) throw new ApiError(502, "STORAGE", "Не удалось сохранить фото");
    return { url: `${base}/storage/v1/object/public/photos/${path}` };
  });
}

async function view(db: PrismaClient, id: string) {
  const row = await db.booking.findUniqueOrThrow({ where: { id }, include: { client: true, barber: true, services: true } });
  return {
    id: row.id,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    client: { name: row.client.name, phone: row.client.phone },
    barber: { name: row.barber.name },
    services: row.services.map((service) => service.name),
  };
}

function isFk(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error.code === "P2003" || error.code === "P2014"));
}
