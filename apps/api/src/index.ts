import "./env";
import Fastify from "fastify";
import { configureApp } from "./build-app";
import { setupBotMenu } from "./telegram/handlers";

const app = configureApp(Fastify({ logger: true }));

// Без top-level await: на Vercel долгоживущий listen() не должен блокировать загрузку модуля.
app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3011) })
  .then(() => {
    try {
      setupBotMenu();
    } catch (error) {
      app.log.error(error);
    }
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
