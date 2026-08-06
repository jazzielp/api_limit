import type { Request, Response, NextFunction } from "express";
import {
  AppError,
  RateLimitExceededError,
  ERROR_CODE,
  type ErrorCode,
  type ValidationIssue,
} from "../lib/errors.js";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof RateLimitExceededError) {
    res.setHeader("X-RateLimit-Limit", String(err.limit));
    res.setHeader("X-RateLimit-Remaining", String(0));
    res.setHeader("X-RateLimit-Reset", String(Math.floor(err.resetAt.getTime() / 1000)));
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  if (err instanceof AppError) {
    const errorResponse: {
      message: string;
      code?: ErrorCode;
      issues?: ValidationIssue[];
    } = {
      message: err.message,
      code: err.code,
    };

    if (err.issues !== undefined) {
      errorResponse.issues = err.issues;
    }

    return res.status(err.statusCode).json({ error: errorResponse });
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);

  return res.status(500).json({
    error: {
      message: "Internal server error",
      code: ERROR_CODE.INTERNAL_ERROR,
    },
  });
}
