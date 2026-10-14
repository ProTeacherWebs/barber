import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { barberDetailSchema, barberParamsSchema, barberSchema } from "../schemas.js";

export function registerBarbers(app: FastifyInstance) {
  app.get("/barbers", async () => {
    const rows = await prisma.barber.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    return {
      barbers: rows.map((row) =>
        barberSchema.parse({
          id: row.id,
          name: row.name,
          bio: row.bio,
          experienceYears: row.experienceYears,
          photoUrl: row.photoUrl,
        }),
      ),
    };
  });

  app.get("/barbers/:id", async (request, reply) => {
    const { id } = barberParamsSchema.parse(request.params);
    const row = await prisma.barber.findFirst({
      where: { id, isActive: true },
      include: {
        services: {
          where: { isEnabled: true },
          include: { service: true },
        },
      },
    });

    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Барбер не найден" } });
    }

    const services = row.services
      .filter((link) => link.service.isActive)
      .sort((left, right) => left.service.sortOrder - right.service.sortOrder)
      .map((link) => ({
        id: link.service.id,
        name: link.service.name,
        description: link.service.description,
        durationMin: link.durationMin ?? link.service.durationMin,
        price: link.price ?? link.service.price,
      }));

    return {
      barber: barberDetailSchema.parse({
        id: row.id,
        name: row.name,
        bio: row.bio,
        experienceYears: row.experienceYears,
        photoUrl: row.photoUrl,
        services,
      }),
    };
  });
}
