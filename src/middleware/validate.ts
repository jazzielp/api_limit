import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { AppError, ERROR_CODE, type ValidationIssue } from "../lib/errors.js";

export function validate<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
        path: issue.path as ValidationIssue["path"],
        message: issue.message,
      }));
      return next(
        new AppError(
          400,
          "Validation error",
          ERROR_CODE.VALIDATION_ERROR,
          issues,
        ),
      );
    }

    req.body = result.data as T;
    return next();
  };
}
