import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma";
import { serviceSchema } from "../schemas";

export function registerServices(app: FastifyInstance) {
  app.get("/services", async () => {
    const rows = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    return {
      services: rows.map((row) =>
        serviceSchema.parse({
          id: row.id,
          name: row.name,
          description: row.description,
          durationMin: row.durationMin,
          price: row.price,
        }),
      ),
    };
  });
}
