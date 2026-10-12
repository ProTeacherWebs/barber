import { z } from "zod";

export const barberParamsSchema = z.object({
  id: z.string().uuid(),
});

export const serviceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  durationMin: z.number().int(),
  price: z.number().int(),
});

export const barberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  bio: z.string(),
  experienceYears: z.number().int(),
  photoUrl: z.string(),
});

export const barberDetailSchema = barberSchema.extend({
  services: z.array(serviceSchema),
});
