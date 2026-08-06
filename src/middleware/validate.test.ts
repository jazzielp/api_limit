import { describe, it, expect, vi, type MockedFunction } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { validate } from "./validate.js";
import { AppError, ERROR_CODE } from "../lib/errors.js";

describe("validate middleware", () => {
  const schema = z.object({
    email: z.email(),
    age: z.number().int().min(18),
  });

  it("passes parsed body and calls next without an error", () => {
    const middleware = validate(schema);
    const req = { body: { email: "alice@example.com", age: 30 } } as Request;
    const next = vi.fn() as MockedFunction<NextFunction>;

    middleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: "alice@example.com", age: 30 });
  });

  it("returns a 400 AppError with sanitized structured issues", () => {
    const middleware = validate(schema);
    const req = { body: { email: "not-an-email", age: 12 } } as Request;
    const next = vi.fn() as MockedFunction<NextFunction>;

    middleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(ERROR_CODE.VALIDATION_ERROR);
    expect(error.message).toBe("Validation error");
    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["email"] }),
        expect.objectContaining({ path: ["age"] }),
      ]),
    );
    expect(error.issues).toHaveLength(2);
  });
});
