import { Prisma } from "@prisma/client";

export const ERROR_CODE = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  TOKEN_VERSION_MISMATCH: "TOKEN_VERSION_MISMATCH",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: ErrorCode,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class RateLimitExceededError extends AppError {
  constructor(
    public readonly limit: number,
    public readonly count: number,
    public readonly resetAt: Date,
  ) {
    super(429, "Daily rate limit exceeded", ERROR_CODE.RATE_LIMIT_EXCEEDED);
    this.name = "RateLimitExceededError";
  }
}

export function isRecordNotFoundError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
