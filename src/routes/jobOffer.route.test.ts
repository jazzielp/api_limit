import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getEnv } from "../config/env.js";
import { apiKeyService } from "../services/apiKey.service.js";
import { rateLimitService } from "../services/rateLimit.service.js";
import { openaiService } from "../services/IA/openia.js";
import { RateLimitExceededError, AppError, ERROR_CODE } from "../lib/errors.js";
import type { JobOffer } from "../types/jobOffer.js";

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

vi.mock("../services/IA/openia.js", () => ({
  openaiService: {
    name: "OpenAI",
    extract: vi.fn(),
  },
}));

const app = createApp(getEnv());

const OFFER_TEXT = "Buscamos Senior Backend Engineer para Acme. Stack: Node.js, TypeScript.";

const PARSED_OFFER: JobOffer = {
  jobTitle: "Senior Backend Engineer",
  company: "Acme",
  mainResponsibilities: ["Design and maintain REST APIs"],
  requiredTechnologies: ["Node.js", "TypeScript"],
  optionalTechnologies: [],
  languages: ["Spanish"],
  workMode: null,
  salary: null,
  benefits: [],
};

function authenticatedWithQuota(remaining = 99): void {
  vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });
  vi.mocked(rateLimitService.consume).mockResolvedValue({
    limit: 100,
    remaining,
    resetAt: new Date("2026-01-02T00:00:00Z"),
  });
}

describe("POST /job-offers/parse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openaiService.extract).mockResolvedValue(PARSED_OFFER);
  });

  it("returns the parsed job offer with rate-limit headers for a valid key", async () => {
    authenticatedWithQuota();

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PARSED_OFFER);
    expect(response.headers["x-ratelimit-limit"]).toBe("100");
    expect(response.headers["x-ratelimit-remaining"]).toBe("99");
    expect(response.headers["x-ratelimit-reset"]).toBe("1767312000");
    expect(rateLimitService.consume).toHaveBeenCalledWith("user-1");
  });

  it("forwards the submitted text to the AI provider", async () => {
    authenticatedWithQuota();

    await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(openaiService.extract).toHaveBeenCalledWith(OFFER_TEXT);
  });

  it("returns 429 without calling the AI provider when the daily limit is exceeded", async () => {
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
    expect(openaiService.extract).not.toHaveBeenCalled();
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
    expect(openaiService.extract).not.toHaveBeenCalled();
  });

  it("returns 401 when the API key header is missing", async () => {
    const response = await request(app).post("/job-offers/parse").send({ text: OFFER_TEXT });

    expect(response.status).toBe(401);
    expect(rateLimitService.consume).not.toHaveBeenCalled();
    expect(openaiService.extract).not.toHaveBeenCalled();
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
    expect(openaiService.extract).not.toHaveBeenCalled();
  });

  it("returns 400 for text longer than the 20000 character limit", async () => {
    vi.mocked(apiKeyService.authenticate).mockResolvedValue({ userId: "user-1" });

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: "a".repeat(20001) });

    expect(response.status).toBe(400);
    expect(rateLimitService.consume).not.toHaveBeenCalled();
  });

  it("ignores unknown body fields", async () => {
    authenticatedWithQuota(42);

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT, unexpected: "ignored" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PARSED_OFFER);
    expect(openaiService.extract).toHaveBeenCalledWith(OFFER_TEXT);
  });

  it("returns 500 when the AI provider fails, after the quota was already consumed", async () => {
    authenticatedWithQuota();
    vi.mocked(openaiService.extract).mockRejectedValue(new Error("Connection error"));

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(500);
    expect(rateLimitService.consume).toHaveBeenCalledWith("user-1");
  });

  it("returns 500 when the AI provider returns a payload off contract", async () => {
    authenticatedWithQuota();
    vi.mocked(openaiService.extract).mockRejectedValue(
      new Error("OpenAI returned an invalid job offer response"),
    );

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe(ERROR_CODE.INTERNAL_ERROR);
  });

  it("does not leak the AI provider error message to the client", async () => {
    authenticatedWithQuota();
    vi.mocked(openaiService.extract).mockRejectedValue(
      new Error("401 Incorrect API key provided: sk-proj-secret"),
    );

    const response = await request(app)
      .post("/job-offers/parse")
      .set("x-api-key", "valid-key")
      .send({ text: OFFER_TEXT });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("sk-proj-secret");
  });

  it("does not expose the removed /protected route", async () => {
    const response = await request(app).get("/protected").set("x-api-key", "valid-key");

    expect(response.status).toBe(404);
  });
});
