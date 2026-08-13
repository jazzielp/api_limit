import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { closePrisma } from "./db/prisma.js";

let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

try {
  const env = loadEnv();
  const app = createApp(env);
  server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.info(`Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });
} catch (error) {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  process.exit(1);
}

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.info(`Received ${signal}, shutting down gracefully`);
  void closePrisma()?.then(() => {
    server?.close(() => {
      process.exit(0);
    });
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
