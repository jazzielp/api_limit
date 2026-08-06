import { describe, it, expect, vi } from "vitest";
import { createRateLimitService, DAILY_LIMIT } from "./rateLimit.service.js";
import { RateLimitExceededError } from "../lib/errors.js";

function createMockDeps(count: number, previousCount: number | null = null) {
  return {
    rateLimitRepository: {
      consume: vi.fn().mockResolvedValue({ count, previousCount }),
    },
    dailyLimit: DAILY_LIMIT,
  };
}

describe("RateLimitService", () => {
  it("returns remaining requests when under the limit", async () => {
    const service = createRateLimitService(
      createMockDeps(50, 49) as ReturnType<typeof createMockDeps>,
    );

    const status = await service.consume("user-1");

    expect(status.limit).toBe(DAILY_LIMIT);
    expect(status.remaining).toBe(50);
  });

  it("returns zero remaining when exactly at the limit", async () => {
    const service = createRateLimitService(
      createMockDeps(DAILY_LIMIT, DAILY_LIMIT - 1) as ReturnType<typeof createMockDeps>,
    );

    const status = await service.consume("user-1");

    expect(status.remaining).toBe(0);
  });

  it("throws a RateLimitExceededError on the 101st request", async () => {
    const service = createRateLimitService(
      createMockDeps(DAILY_LIMIT, DAILY_LIMIT) as ReturnType<typeof createMockDeps>,
    );

    await expect(service.consume("user-1")).rejects.toThrow(RateLimitExceededError);
  });

  it("passes an explicit UTC YYYY-MM-DD string to the repository", async () => {
    const deps = createMockDeps(1, 0) as ReturnType<typeof createMockDeps>;
    const service = createRateLimitService(deps);

    await service.consume("user-1");

    expect(deps.rateLimitRepository.consume).toHaveBeenCalledWith(
      "user-1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      DAILY_LIMIT,
    );
  });
});
