import { RateLimitExceededError } from "../lib/errors.js";
import { getCurrentUtcDateString, getNextUtcMidnight } from "../lib/date.js";
import type { RateLimitRepository } from "../repositories/rateLimit.repository.js";
import { rateLimitRepository } from "../repositories/rateLimit.repository.js";

export const DAILY_LIMIT = 100;

export interface RateLimitServiceDeps {
  rateLimitRepository: RateLimitRepository;
  dailyLimit: number;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetAt: Date;
}

export function createRateLimitService(deps: RateLimitServiceDeps) {
  async function consume(userId: string): Promise<RateLimitStatus> {
    const date = getCurrentUtcDateString();
    const resetAt = getNextUtcMidnight();
    const { count, previousCount } = await deps.rateLimitRepository.consume(
      userId,
      date,
      deps.dailyLimit,
    );

    if (previousCount !== null && previousCount >= deps.dailyLimit) {
      throw new RateLimitExceededError(deps.dailyLimit, count, resetAt);
    }

    const remaining = Math.max(0, deps.dailyLimit - count);

    return {
      limit: deps.dailyLimit,
      remaining,
      resetAt,
    };
  }

  return { consume };
}

export const rateLimitService = createRateLimitService({
  rateLimitRepository,
  dailyLimit: DAILY_LIMIT,
});
