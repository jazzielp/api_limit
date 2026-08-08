import express, { type Application } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { authRouter } from "./routes/auth.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { apiKeyRouter } from "./routes/apiKey.routes.js";
import { protectedRouter } from "./routes/protected.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { authenticate } from "./middleware/authenticate.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import type { Env } from "./config/env.js";
import { docsRouter } from "./routes/docs.routes.js";

export const APPLICATION_ROUTE_INVENTORY = [
  ["GET", "/health"],
  ["GET", "/health/ready"],
  ["POST", "/auth/register"],
  ["POST", "/auth/login"],
  ["POST", "/auth/verify-email"],
  ["POST", "/auth/resend-verification"],
  ["POST", "/auth/forgot-password"],
  ["POST", "/auth/reset-password"],
  ["GET", "/users/me"],
  ["PATCH", "/users/me"],
  ["POST", "/users/me/change-password"],
  ["POST", "/api-keys"],
  ["GET", "/api-keys"],
  ["DELETE", "/api-keys/:id"],
  ["GET", "/protected"],
] as const;

export function createApp(env: Env): Application {
  const app = express();

  app.set("trust proxy", env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    pinoHttp({
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.token",
          "req.body.code",
        ],
        remove: true,
      },
    }),
  );
  app.use(express.json());

  app.use(docsRouter);
  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/users", authenticate, userRouter);
  app.use("/api-keys", authenticate, apiKeyRouter);
  app.use("/protected", apiKeyAuth, protectedRouter);

  app.use(errorHandler);

  return app;
}
