import type { Request, Response } from "express";
import { RateLimitExceededError } from "../lib/errors.js";
import { rateLimitService } from "../services/rateLimit.service.js";

export const protectedController = {
  async ok(req: Request, res: Response) {
    const userId = req.apiKeyUserId!;

    try {
      const status = await rateLimitService.consume(userId);

      res.setHeader("X-RateLimit-Limit", String(status.limit));
      res.setHeader("X-RateLimit-Remaining", String(status.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.floor(status.resetAt.getTime() / 1000)));

      return res.status(200).json({ status: "ok" });
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        res.setHeader("X-RateLimit-Limit", String(error.limit));
        res.setHeader("X-RateLimit-Remaining", String(0));
        res.setHeader("X-RateLimit-Reset", String(Math.floor(error.resetAt.getTime() / 1000)));
        return res.status(429).json({
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }

      throw error;
    }
  },
};
