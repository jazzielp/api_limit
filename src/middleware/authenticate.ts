import type { Request, Response, NextFunction } from "express";
import { AppError, ERROR_CODE } from "../lib/errors.js";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";
import { userRepository } from "../repositories/user.repository.js";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (header === undefined || !header.startsWith("Bearer ")) {
    return next(
      new AppError(401, "Missing or invalid authorization header", ERROR_CODE.UNAUTHORIZED),
    );
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    const user = await userRepository.findById(payload.userId);

    if (user === null || user.tokenVersion !== payload.tokenVersion) {
      return next(new AppError(401, "Invalid or expired token", ERROR_CODE.TOKEN_VERSION_MISMATCH));
    }

    req.user = payload;
    return next();
  } catch {
    return next(new AppError(401, "Invalid or expired token", ERROR_CODE.UNAUTHORIZED));
  }
}
