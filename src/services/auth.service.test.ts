import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";
import { createAuthService } from "./auth.service.js";
import { AppError, ERROR_CODE } from "../lib/errors.js";

const baseUser = {
  id: "user-1",
  email: "alice@example.com",
  passwordHash: "hashed-password",
  name: null,
  emailVerifiedAt: null,
  tokenVersion: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} satisfies User;

function createMockDeps(overrides: Record<string, unknown> = {}) {
  return {
    env: {
      NODE_ENV: "test",
      RESET_PASSWORD_URL: "http://localhost:3000/reset-password",
    },
    userRepository: {
      create: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      markEmailVerified: vi.fn(),
      updatePasswordAndIncrementTokenVersion: vi.fn(),
      incrementTokenVersion: vi.fn(),
    },
    emailVerificationRepository: {
      upsert: vi.fn(),
      findByUserId: vi.fn(),
      decrementAttempts: vi.fn(),
      atomicDecrementAttempts: vi.fn(),
      deleteByUserId: vi.fn(),
    },
    passwordResetRepository: {
      create: vi.fn(),
      createLatestForUser: vi.fn(),
      findByTokenHash: vi.fn(),
      findLatestUnusedByUser: vi.fn(),
      markUsed: vi.fn(),
      deleteUnusedByUser: vi.fn(),
      consumeAndUpdatePassword: vi.fn(),
    },
    mailer: {
      sendVerificationCode: vi.fn(),
      sendPasswordReset: vi.fn(),
    },
    hashPassword: vi.fn(),
    verifyPassword: vi.fn(),
    hashVerificationCode: vi.fn(),
    verifyVerificationCode: vi.fn(),
    generateVerificationCode: vi.fn(),
    generateResetToken: vi.fn(),
    hashToken: vi.fn(),
    signAccessToken: vi.fn(),
    ...overrides,
  };
}

describe("AuthService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:10:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("register", () => {
    it("creates a user and sends a verification code", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.create.mockResolvedValue(baseUser);
      deps.hashPassword.mockResolvedValue("hashed-password");
      deps.generateVerificationCode.mockReturnValue("123456");
      deps.hashVerificationCode.mockResolvedValue("hashed-code");
      deps.emailVerificationRepository.upsert.mockResolvedValue({
        id: "v1",
        userId: baseUser.id,
        codeHash: "hashed-code",
        attemptsRemaining: 5,
        expiresAt: new Date("2026-01-01T00:30:00Z"),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const result = await service.register({
        email: "Alice@Example.com",
        password: "Password123",
      });

      expect(result).toEqual({
        id: baseUser.id,
        email: "alice@example.com",
        createdAt: baseUser.createdAt,
      });
      expect(deps.userRepository.create).toHaveBeenCalledWith({
        email: "alice@example.com",
        passwordHash: "hashed-password",
      });
      expect(deps.mailer.sendVerificationCode).toHaveBeenCalledWith({
        userId: baseUser.id,
        email: "alice@example.com",
        code: "123456",
      });
    });

    it("translates a unique constraint error into a conflict response", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.hashPassword.mockResolvedValue("hashed-password");
      deps.userRepository.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "7.0.0",
        }),
      );

      await expect(
        service.register({ email: baseUser.email, password: "Password123" }),
      ).rejects.toThrow(new AppError(409, "Email already registered", ERROR_CODE.CONFLICT));
    });
  });

  describe("login", () => {
    it("returns a token for valid credentials when verified", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue({
        ...baseUser,
        emailVerifiedAt: new Date("2026-01-01T00:05:00Z"),
      });
      deps.verifyPassword.mockResolvedValue(true);
      deps.signAccessToken.mockReturnValue("jwt-token");

      const result = await service.login({
        email: baseUser.email,
        password: "Password123",
      });

      expect(result.token).toBe("jwt-token");
      expect(result.user.id).toBe(baseUser.id);
      expect(deps.signAccessToken).toHaveBeenCalledWith({
        userId: baseUser.id,
        email: baseUser.email,
        tokenVersion: baseUser.tokenVersion,
      });
    });

    it("rejects login when email is not verified", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.verifyPassword.mockResolvedValue(true);

      await expect(
        service.login({ email: baseUser.email, password: "Password123" }),
      ).rejects.toThrow(
        new AppError(
          403,
          "Email not verified. Please verify your email before logging in.",
          ERROR_CODE.EMAIL_NOT_VERIFIED,
        ),
      );
    });

    it("returns a generic unauthorized error for invalid credentials", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.verifyPassword.mockResolvedValue(false);

      await expect(service.login({ email: baseUser.email, password: "wrong" })).rejects.toThrow(
        new AppError(401, "Invalid credentials", ERROR_CODE.UNAUTHORIZED),
      );
    });
  });

  describe("verifyEmail", () => {
    const baseVerification = {
      id: "v1",
      userId: baseUser.id,
      codeHash: "hashed-code",
      attemptsRemaining: 5,
      expiresAt: new Date("2026-01-01T00:30:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    };

    it("verifies the email with a valid code", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.emailVerificationRepository.findByUserId.mockResolvedValue(baseVerification);
      deps.verifyVerificationCode.mockResolvedValue(true);

      await service.verifyEmail({ email: baseUser.email, code: "123456" });

      expect(deps.userRepository.markEmailVerified).toHaveBeenCalledWith(baseUser.id);
      expect(deps.emailVerificationRepository.deleteByUserId).toHaveBeenCalledWith(baseUser.id);
    });

    it("throws a generic error when the verification code has expired", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.emailVerificationRepository.findByUserId.mockResolvedValue({
        ...baseVerification,
        expiresAt: new Date("2025-12-31T23:59:59Z"),
      });

      await expect(service.verifyEmail({ email: baseUser.email, code: "123456" })).rejects.toThrow(
        new AppError(400, "Invalid or expired verification code", ERROR_CODE.VALIDATION_ERROR),
      );
    });

    it("throws and atomically decrements attempts when the code is wrong", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.emailVerificationRepository.findByUserId.mockResolvedValue(baseVerification);
      deps.verifyVerificationCode.mockResolvedValue(false);
      deps.emailVerificationRepository.atomicDecrementAttempts.mockResolvedValue({
        verification: { ...baseVerification, attemptsRemaining: 4 },
        attemptsRemaining: 4,
        expired: false,
        exhausted: false,
      });

      await expect(service.verifyEmail({ email: baseUser.email, code: "000000" })).rejects.toThrow(
        new AppError(400, "Invalid verification code", ERROR_CODE.VALIDATION_ERROR),
      );
      expect(deps.emailVerificationRepository.atomicDecrementAttempts).toHaveBeenCalledWith(
        baseUser.id,
      );
    });

    it("throws a generic error when attempts are exhausted", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.emailVerificationRepository.findByUserId.mockResolvedValue({
        ...baseVerification,
        attemptsRemaining: 0,
      });

      await expect(service.verifyEmail({ email: baseUser.email, code: "123456" })).rejects.toThrow(
        new AppError(400, "Invalid or expired verification code", ERROR_CODE.VALIDATION_ERROR),
      );
    });
  });

  describe("forgotPassword", () => {
    it("creates a single latest reset token and sends a link", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(baseUser);
      deps.generateResetToken.mockReturnValue("reset-token");
      deps.hashToken.mockReturnValue("hashed-token");
      deps.passwordResetRepository.createLatestForUser.mockResolvedValue({
        id: "r1",
        userId: baseUser.id,
        tokenHash: "hashed-token",
        expiresAt: new Date("2026-01-01T00:25:00Z"),
        usedAt: null,
        createdAt: new Date("2026-01-01T00:10:00Z"),
      });

      await service.forgotPassword({ email: baseUser.email });

      expect(deps.passwordResetRepository.createLatestForUser).toHaveBeenCalledWith({
        userId: baseUser.id,
        tokenHash: "hashed-token",
        expiresAt: new Date("2026-01-01T00:25:00Z"),
      });
      expect(deps.mailer.sendPasswordReset).toHaveBeenCalledWith({
        userId: baseUser.id,
        email: baseUser.email,
        token: "reset-token",
        resetUrl: "http://localhost:3000/reset-password?token=reset-token",
      });
    });

    it("returns silently for unknown emails", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.userRepository.findByEmail.mockResolvedValue(null);

      await service.forgotPassword({ email: "unknown@example.com" });

      expect(deps.passwordResetRepository.createLatestForUser).not.toHaveBeenCalled();
    });
  });

  describe("resetPassword", () => {
    it("consumes the token, updates password and increments token version", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.hashToken.mockReturnValue("hashed-token");
      deps.hashPassword.mockResolvedValue("new-hash");
      deps.passwordResetRepository.consumeAndUpdatePassword.mockResolvedValue({
        reset: {
          id: "r1",
          userId: baseUser.id,
          tokenHash: "hashed-token",
          expiresAt: new Date("2026-01-01T00:25:00Z"),
          usedAt: new Date("2026-01-01T00:10:00Z"),
          createdAt: new Date("2026-01-01T00:10:00Z"),
        },
        user: {
          id: baseUser.id,
          email: baseUser.email,
          tokenVersion: 2,
        },
      });

      await service.resetPassword({ token: "reset-token", password: "NewPassword123" });

      expect(deps.passwordResetRepository.consumeAndUpdatePassword).toHaveBeenCalledWith(
        "hashed-token",
        "new-hash",
      );
    });

    it("throws when the token is invalid or expired", async () => {
      const deps = createMockDeps();
      const service = createAuthService(deps as ReturnType<typeof createMockDeps>);

      deps.hashToken.mockReturnValue("hashed-token");
      deps.hashPassword.mockResolvedValue("new-hash");
      deps.passwordResetRepository.consumeAndUpdatePassword.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: "reset-token", password: "NewPassword123" }),
      ).rejects.toThrow(
        new AppError(400, "Invalid or expired reset token", ERROR_CODE.VALIDATION_ERROR),
      );
    });
  });
});
