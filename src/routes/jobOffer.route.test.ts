import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getEnv } from "../config/env.js";
import { apiKeyService } from "../services/apiKey.service.js";
import { rateLimitService } from "../services/rateLimit.service.js";
import { SIMULATED_JOB_OFFER } from "../services/jobOffer.service.js";
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

const OFFER_TEXT = "Buscamos Senior Backend Engineer para Acme. Stack: Node.js, TypeScript.";

describe("POST /job-offers/parse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the simulated job offer with rate-limit headers for a valid key", async () => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });
    vi.mocked(rateLimitService.consume).mockResolvedValue({
      limit: 100,
      remaining: 99,
      resetAt: new Date("2026-01-02T00:00:00Z"),
    });

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(SIMULATED_JOB_OFFER);
    expect(response.headers["x-ratelimit-limit"]).toBe("100");
    expect(response.headers["x-ratelimit-remaining"]).toBe("99");
    expect(response.headers["x-ratelimit-reset"]).toBe("1767312000");
    expect(rateLimitService.consume).toHaveBeenCalledWith("user-1");
  });

  it("returns 429 when the daily limit is exceeded", async () => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });
    vi.mocked(rateLimitService.consume).mockImplementation(() => {
      throw new RateLimitExceededError(100, 101, new Date("2026-01-02T00:00:00Z"));
    });

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe(ERROR_CODE.RATE_LIMIT_EXCEEDED);
    expect(response.headers["x-ratelimit-limit"]).toBe("100");
    expect(response.headers["x-ratelimit-remaining"]).toBe("0");
    expect(response.headers["x-ratelimit-reset"]).toBe("1767312000");
  });

  it("returns 401 for an invalid API key", async () => {
    vi.mocked(apiKeyService.authenticate).mockRejectedValue(
      new AppError(401, "Invalid API key", ERROR_CODE.UNAUTHORIZED),
    );

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "bad-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(401);
    expect(rateLimitService.consume).not.toHaveBeenCalled();
  });

  it("returns 401 when the API key header is missing", async () => {
    const response = await request(app).post("/job-offers/parse").send({ text: OFFER_TEXT });

    expect(response.status).toBe(401);
    expect(rateLimitService.consume).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing text field", {}],
    ["an empty text field", { text: "" }],
    ["a non-string text field", { text: 42 }],
  ])("returns 400 without consuming quota for %s", async (_case, body) => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ERROR_CODE.VALIDATION_ERROR);
    expect(rateLimitService.consume).not.toHaveBeenCalled();
  });

  it("ignores unknown body fields", async () => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });
    vi.mocked(rateLimitService.consume).mockResolvedValue({
      limit: 100,
      remaining: 42,
      resetAt: new Date("2026-01-02T00:00:00Z"),
    });

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT, unexpected: "ignored" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(SIMULATED_JOB_OFFER);
  });

  it("does not expose the removed /protected route", async () => {
    const response = await request(app).get("/protected").set("x-api-key", "valid-key");

    expect(response.status).toBe(404);
  });
});
