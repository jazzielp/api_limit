import { Prisma } from "@prisma/client";
import { AppError, ERROR_CODE } from "../lib/errors.js";
import type { Mailer } from "../lib/mailer.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { EmailVerificationRepository } from "../repositories/emailVerification.repository.js";
import type { PasswordResetRepository } from "../repositories/passwordReset.repository.js";
import type { Env } from "../config/env.js";
import {
  hashPassword,
  verifyPassword,
  hashVerificationCode,
  verifyVerificationCode,
  generateVerificationCode,
  generateResetToken,
  hashToken,
} from "../lib/crypto.js";
import { signAccessToken, type AccessTokenPayload } from "../lib/jwt.js";
import { userRepository } from "../repositories/user.repository.js";
import { emailVerificationRepository } from "../repositories/emailVerification.repository.js";
import { passwordResetRepository } from "../repositories/passwordReset.repository.js";
import { getMailer } from "../config/mailer.js";
import { getEnv } from "../config/env.js";
import { addMinutes } from "../lib/date.js";

const VERIFICATION_ATTEMPTS = 5;
const VERIFICATION_TTL_MINUTES = 30;
const RESET_TTL_MINUTES = 15;
const RESEND_COOLDOWN_MS = 60_000;

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface VerifyEmailInput {
  email: string;
  code: string;
}

export interface ResendVerificationInput {
  email: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface AuthServiceDeps {
  env: Env;
  userRepository: UserRepository;
  emailVerificationRepository: EmailVerificationRepository;
  passwordResetRepository: PasswordResetRepository;
  mailer: Mailer;
  hashPassword: (plain: string) => Promise<string>;
  verifyPassword: (hash: string, plain: string) => Promise<boolean>;
  hashVerificationCode: (code: string) => Promise<string>;
  verifyVerificationCode: (hash: string, code: string) => Promise<boolean>;
  generateVerificationCode: () => string;
  generateResetToken: () => string;
  hashToken: (token: string) => string;
  signAccessToken: (payload: AccessTokenPayload) => string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function buildResetUrl(env: Env, token: string): string {
  const base = env.RESET_PASSWORD_URL ?? "http://localhost:3000/reset-password";
  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function createAuthService(deps: AuthServiceDeps) {
  async function register(input: RegisterInput) {
    const email = normalizeEmail(input.email);

    try {
      const passwordHash = await deps.hashPassword(input.password);
      const user = await deps.userRepository.create({ email, passwordHash });

      const code = deps.generateVerificationCode();
      await deps.emailVerificationRepository.upsert({
        userId: user.id,
        codeHash: await deps.hashVerificationCode(code),
        attemptsRemaining: VERIFICATION_ATTEMPTS,
        expiresAt: addMinutes(new Date(), VERIFICATION_TTL_MINUTES),
      });

      await deps.mailer.sendVerificationCode({ userId: user.id, email, code });

      return {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, "Email already registered", ERROR_CODE.CONFLICT);
      }
      throw error;
    }
  }

  async function login(input: LoginInput) {
    const email = normalizeEmail(input.email);
    const user = await deps.userRepository.findByEmail(email);

    if (user === null) {
      throw new AppError(401, "Invalid credentials", ERROR_CODE.UNAUTHORIZED);
    }

    const valid = await deps.verifyPassword(user.passwordHash, input.password);

    if (!valid) {
      throw new AppError(401, "Invalid credentials", ERROR_CODE.UNAUTHORIZED);
    }

    if (user.emailVerifiedAt === null) {
      throw new AppError(
        403,
        "Email not verified. Please verify your email before logging in.",
        ERROR_CODE.EMAIL_NOT_VERIFIED,
      );
    }

    const token = deps.signAccessToken({
      userId: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }

  async function verifyEmail(input: VerifyEmailInput) {
    const email = normalizeEmail(input.email);
    const user = await deps.userRepository.findByEmail(email);

    if (user === null || user.emailVerifiedAt !== null) {
      return;
    }

    const verification = await deps.emailVerificationRepository.findByUserId(user.id);

    if (verification === null) {
      return;
    }

    if (verification.attemptsRemaining <= 0) {
      throw new AppError(400, "Invalid or expired verification code", ERROR_CODE.VALIDATION_ERROR);
    }

    if (new Date() > verification.expiresAt) {
      throw new AppError(400, "Invalid or expired verification code", ERROR_CODE.VALIDATION_ERROR);
    }

    const valid = await deps.verifyVerificationCode(verification.codeHash, input.code);

    if (!valid) {
      const result = await deps.emailVerificationRepository.atomicDecrementAttempts(user.id);

      if (result.exhausted || result.expired) {
        throw new AppError(
          400,
          "Invalid or expired verification code",
          ERROR_CODE.VALIDATION_ERROR,
        );
      }

      throw new AppError(400, "Invalid verification code", ERROR_CODE.VALIDATION_ERROR);
    }

    await deps.userRepository.markEmailVerified(user.id);
    await deps.emailVerificationRepository.deleteByUserId(user.id);
  }

  async function resendVerification(input: ResendVerificationInput) {
    const email = normalizeEmail(input.email);
    const user = await deps.userRepository.findByEmail(email);

    if (user === null || user.emailVerifiedAt !== null) {
      return;
    }

    const existing = await deps.emailVerificationRepository.findByUserId(user.id);

    if (existing !== null && existing.updatedAt.getTime() > Date.now() - RESEND_COOLDOWN_MS) {
      throw new AppError(429, "Please wait before resending", ERROR_CODE.RATE_LIMIT_EXCEEDED);
    }

    const code = deps.generateVerificationCode();
    await deps.emailVerificationRepository.upsert({
      userId: user.id,
      codeHash: await deps.hashVerificationCode(code),
      attemptsRemaining: VERIFICATION_ATTEMPTS,
      expiresAt: addMinutes(new Date(), VERIFICATION_TTL_MINUTES),
    });

    await deps.mailer.sendVerificationCode({ userId: user.id, email, code });
  }

  async function forgotPassword(input: ForgotPasswordInput) {
    const email = normalizeEmail(input.email);
    const user = await deps.userRepository.findByEmail(email);

    if (user === null) {
      return;
    }

    const token = deps.generateResetToken();
    await deps.passwordResetRepository.createLatestForUser({
      userId: user.id,
      tokenHash: deps.hashToken(token),
      expiresAt: addMinutes(new Date(), RESET_TTL_MINUTES),
    });

    const resetUrl = buildResetUrl(deps.env, token);
    await deps.mailer.sendPasswordReset({ userId: user.id, email, token, resetUrl });
  }

  async function resetPassword(input: ResetPasswordInput) {
    const tokenHash = deps.hashToken(input.token);
    const passwordHash = await deps.hashPassword(input.password);

    const result = await deps.passwordResetRepository.consumeAndUpdatePassword(
      tokenHash,
      passwordHash,
    );

    if (result === null) {
      throw new AppError(400, "Invalid or expired reset token", ERROR_CODE.VALIDATION_ERROR);
    }
  }

  return {
    register,
    login,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
  };
}

let authServiceInstance: ReturnType<typeof createAuthService> | undefined;

function getAuthService(): ReturnType<typeof createAuthService> {
  if (authServiceInstance === undefined) {
    authServiceInstance = createAuthService({
      env: getEnv(),
      userRepository,
      emailVerificationRepository,
      passwordResetRepository,
      mailer: getMailer(),
      hashPassword,
      verifyPassword,
      hashVerificationCode,
      verifyVerificationCode,
      generateVerificationCode,
      generateResetToken,
      hashToken,
      signAccessToken,
    });
  }
  return authServiceInstance;
}

export const authService: ReturnType<typeof createAuthService> = {
  register: (...args) => getAuthService().register(...args),
  login: (...args) => getAuthService().login(...args),
  verifyEmail: (...args) => getAuthService().verifyEmail(...args),
  resendVerification: (...args) => getAuthService().resendVerification(...args),
  forgotPassword: (...args) => getAuthService().forgotPassword(...args),
  resetPassword: (...args) => getAuthService().resetPassword(...args),
};
