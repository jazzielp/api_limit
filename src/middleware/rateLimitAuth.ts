import type { NextFunction, Request, Response } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { AppError, ERROR_CODE } from "../lib/errors.js";

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req: Request) => {
    const ip = req.ip ?? "unknown";
    const identifier = (req.body?.email as string | undefined) ?? "";
    return `${ip}:${identifier}`;
  },
  handler: (_req: Request, _res: Response, _next: NextFunction, options: Options) => {
    throw new AppError(
      429,
      `Too many attempts. Please try again after ${Math.ceil(options.windowMs / 60000)} minutes.`,
      ERROR_CODE.RATE_LIMIT_EXCEEDED,
    );
  },
});
