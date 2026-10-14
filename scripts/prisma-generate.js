const { spawnSync } = require("node:child_process");
const path = require("node:path");

let bin;
try {
  bin = require.resolve("prisma/build/index.js", { paths: [process.cwd(), __dirname] });
} catch {
  console.error("prisma CLI не найден, пропускаю generate");
  process.exit(0);
}
const schema = path.join(__dirname, "..", "prisma", "schema.prisma");

const placeholder = "postgresql://user:pass@127.0.0.1:5432/db?schema=public";
const env = { ...process.env };
if (!env.DATABASE_URL) env.DATABASE_URL = placeholder;
if (!env.DIRECT_URL) env.DIRECT_URL = placeholder;

const result = spawnSync(process.execPath, [bin, "generate", "--schema", schema], {
  stdio: "inherit",
  env,
});

process.exit(result.status === null ? 1 : result.status);
