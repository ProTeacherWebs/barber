import "../env.js";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const secret = process.env.CRON_SECRET?.trim();

if (!url || !secret) {
  console.error("Нужны SUPABASE_URL и CRON_SECRET");
  process.exit(1);
}

const functionUrl = `${url}/functions/v1/notifications`;

async function upsertSecret(name: string, value: string, description: string) {
  const existing = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM vault.secrets WHERE name = ${name}
  `;
  const id = existing[0]?.id;
  if (!id) {
    await prisma.$executeRaw`SELECT vault.create_secret(${value}, ${name}, ${description})`;
    return;
  }
  await prisma.$executeRaw`SELECT vault.update_secret(${id}::uuid, ${value})`;
}

try {
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_cron");
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_net");
  await upsertSecret("cron_secret", secret, "notifications bearer");
  await upsertSecret("notifications_url", functionUrl, "edge function url");

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notifications') THEN
        PERFORM cron.unschedule('notifications');
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    SELECT cron.schedule(
      'notifications',
      '*/5 * * * *',
      $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notifications_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
      );
      $cron$
    );
  `);
  console.log("Cron notifications: каждые 5 минут");
} catch (error) {
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "cron";
  console.error(`cron schedule failed: ${code}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
