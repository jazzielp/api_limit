import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppError, ERROR_CODE } from "../lib/errors.js";
import { errorHandler } from "./errorHandler.js";
import { authRateLimiter } from "./rateLimitAuth.js";

describe("authentication rate-limit response headers", () => {
  it("sets Retry-After to 900 seconds when a fixed window has just started", async () => {
    const app = express();
    app.use(express.json());
    app.post("/auth", authRateLimiter, (_req, res) => res.status(204).send());
    app.use(errorHandler);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app).post("/auth").send({ email: "retry-after@example.com" }).expect(204);
    }

    const limited = await request(app)
      .post("/auth")
      .send({ email: "retry-after@example.com" })
      .expect(429);

    expect(limited.headers["retry-after"]).toBe("900");
    expect(limited.headers["ratelimit-reset"]).toBe("900");
  });

  it("does not invent Retry-After for a service-level cooldown error", async () => {
    const app = express();
    app.get("/cooldown", () => {
      throw new AppError(429, "Please wait before resending", ERROR_CODE.RATE_LIMIT_EXCEEDED);
    });
    app.use(errorHandler);

    const limited = await request(app).get("/cooldown").expect(429);

    expect(limited.headers).not.toHaveProperty("retry-after");
  });
});
