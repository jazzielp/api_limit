import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getEnv } from "../config/env.js";
import { apiKeyService } from "../services/apiKey.service.js";
import { rateLimitService } from "../services/rateLimit.service.js";
import { RateLimitExceededError, AppError, ERROR_CODE } from "../lib/errors.js";

vi.mock("../services/apiKey.service.js", () => ({
  apiKeyService: {
    authenticate: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock("../services/rateLimit.service.js", () => ({
  rateLimitService: {
    consume: vi.fn(),
  },
}));

const app = createApp(getEnv());

describe("GET /protected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok with rate-limit headers for a valid key", async () => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });
    vi.mocked(rateLimitService.consume).mockResolvedValue({
      limit: 100,
      remaining: 99,
      resetAt: new Date("2026-01-02T00:00:00Z"),
    });

    const response = await request(app).get("/protected").set("x-api-key", "valid-key");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-ratelimit-limit"]).toBe("100");
    expect(response.headers["x-ratelimit-remaining"]).toBe("99");
    expect(response.headers["x-ratelimit-reset"]).toBe("1767312000");
  });

  it("returns 429 when the daily limit is exceeded", async () => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });
    vi.mocked(rateLimitService.consume).mockImplementation(() => {
      throw new RateLimitExceededError(100, 101, new Date("2026-01-02T00:00:00Z"));
    });

    const response = await request(app).get("/protected").set("x-api-key", "valid-key");

    expect(response.status).toBe(429);
    expect(response.headers["x-ratelimit-remaining"]).toBe("0");
  });

  it("returns 401 for an invalid API key", async () => {
    vi.mocked(apiKeyService.authenticate).mockRejectedValue(
      new AppError(401, "Invalid API key", ERROR_CODE.UNAUTHORIZED),
    );

    const response = await request(app).get("/protected").set("x-api-key", "bad-key");

    expect(response.status).toBe(401);
  });
});
