import "../env.js";
import { runNotifications } from "./job.js";
import { prisma } from "../prisma.js";

try {
  const result = await runNotifications(prisma);
  console.log(`claimed=${result.claimed} sent=${result.sent} completed=${result.completed}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
