import "./env";
import { buildApp } from "./app";
import { setupBotMenu } from "./telegram/handlers";

const app = buildApp();

try {
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3011) });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

try {
  setupBotMenu();
} catch (error) {
  app.log.error(error);
}
