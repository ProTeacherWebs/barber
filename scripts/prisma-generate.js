const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");

const bin = "node_modules/prisma/build/index.js";

if (!existsSync(bin)) {
  console.error("prisma CLI не установлен: node_modules/prisma/build/index.js");
  process.exit(1);
}

const placeholder = "postgresql://user:pass@127.0.0.1:5432/db?schema=public";
const env = { ...process.env };
if (!env.DATABASE_URL) env.DATABASE_URL = placeholder;
if (!env.DIRECT_URL) env.DIRECT_URL = placeholder;

const result = spawnSync(process.execPath, [bin, "generate"], {
  stdio: "inherit",
  env,
});

process.exit(result.status === null ? 1 : result.status);
