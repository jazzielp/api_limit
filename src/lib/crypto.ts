import { createHash, randomBytes, randomInt } from "node:crypto";
import argon2 from "argon2";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

export async function hashVerificationCode(code: string): Promise<string> {
  return argon2.hash(code);
}

export async function verifyVerificationCode(hash: string, code: string): Promise<boolean> {
  return argon2.verify(hash, code);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateApiKey(): string {
  return `apk_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateVerificationCode(): string {
  return String(randomInt(100_000, 999_999));
}
