import "../env.js";
import { prisma } from "../prisma.js";
import { createBarberLink } from "./link.js";

const barberId = process.argv[2];
if (!barberId) {
  console.error("Укажите id барбера: npm run bot:barber-link -- <uuid>");
  process.exit(1);
}

try {
  const link = await createBarberLink(prisma, barberId);
  console.log(link.barberName);
  console.log(link.url ?? `start=${link.start}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
