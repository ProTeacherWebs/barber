import "../env";
import { getBot } from "./client";

const url = process.env.TELEGRAM_WEBHOOK_URL?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const bot = getBot();

if (!bot || !url) {
  console.error("Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_URL");
  process.exit(1);
}

await bot.api.setWebhook(url, secret ? { secret_token: secret } : {});
console.log(`Webhook: ${url}`);
