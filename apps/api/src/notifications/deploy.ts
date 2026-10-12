import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../env";

const url = process.env.SUPABASE_URL?.trim();
const cronSecret = process.env.CRON_SECRET?.trim();
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

if (!url || !cronSecret || !botToken) {
  console.error("Нужны SUPABASE_URL, CRON_SECRET и TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
const env = { ...process.env };

function run(args: string[]) {
  const result = spawnSync("npx", ["supabase", ...args], { stdio: "inherit", env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["functions", "deploy", "notifications", "--project-ref", ref, "--no-verify-jwt"]);

const dir = mkdtempSync(join(tmpdir(), "kromka-"));
const file = join(dir, "secrets.env");
writeFileSync(file, `CRON_SECRET=${cronSecret}\nTELEGRAM_BOT_TOKEN=${botToken}\n`, { mode: 0o600 });
try {
  run(["secrets", "set", "--project-ref", ref, "--env-file", file]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("Edge Function notifications задеплоена");
