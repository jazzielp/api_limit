import type { Request, Response, NextFunction } from "express";
import { AppError, ERROR_CODE } from "../lib/errors.js";
import { apiKeyService } from "../services/apiKey.service.js";

declare global {
  namespace Express {
    interface Request {
      apiKeyUserId?: string;
    }
  }
}

export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  const key = req.get("x-api-key");

  if (key === undefined || key.length === 0) {
    return next(new AppError(401, "Missing API key", ERROR_CODE.UNAUTHORIZED));
  }

  try {
    const { userId } = await apiKeyService.authenticate(key);
    req.apiKeyUserId = userId;
    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError(401, "Invalid API key", ERROR_CODE.UNAUTHORIZED));
  }
}
