import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";

export interface AccessTokenPayload {
  userId: string;
  email: string;
  tokenVersion: number;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const env = getEnv();
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  }) as AccessTokenPayload;
}
