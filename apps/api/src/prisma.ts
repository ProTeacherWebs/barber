import "./env.js";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  datasources: url ? { db: { url } } : undefined,
});
