import type { EmailVerification } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";

export interface UpsertEmailVerificationInput {
  userId: string;
  codeHash: string;
  attemptsRemaining: number;
  expiresAt: Date;
}

export interface AtomicVerifyResult {
  verification: EmailVerification | null;
  attemptsRemaining: number;
  expired: boolean;
  exhausted: boolean;
}

export interface EmailVerificationRepository {
  upsert(input: UpsertEmailVerificationInput): Promise<EmailVerification>;
  findByUserId(userId: string): Promise<EmailVerification | null>;
  decrementAttempts(userId: string, attemptsRemaining: number): Promise<EmailVerification>;
  atomicDecrementAttempts(userId: string): Promise<AtomicVerifyResult>;
  deleteByUserId(userId: string): Promise<void>;
}

export const emailVerificationRepository: EmailVerificationRepository = {
  upsert(input) {
    return getPrisma().emailVerification.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        codeHash: input.codeHash,
        attemptsRemaining: input.attemptsRemaining,
        expiresAt: input.expiresAt,
      },
      update: {
        codeHash: input.codeHash,
        attemptsRemaining: input.attemptsRemaining,
        expiresAt: input.expiresAt,
      },
    });
  },

  findByUserId(userId) {
    return getPrisma().emailVerification.findUnique({ where: { userId } });
  },

  decrementAttempts(userId, attemptsRemaining) {
    return getPrisma().emailVerification.update({
      where: { userId },
      data: { attemptsRemaining },
    });
  },

  async atomicDecrementAttempts(userId: string): Promise<AtomicVerifyResult> {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<EmailVerification[]>`
      UPDATE "EmailVerification"
      SET "attemptsRemaining" = "attemptsRemaining" - 1
      WHERE "userId" = ${userId}
        AND "attemptsRemaining" > 0
        AND "expiresAt" > NOW()
      RETURNING *
    `;

    const verification = result[0] ?? null;

    if (verification !== null) {
      return {
        verification,
        attemptsRemaining: verification.attemptsRemaining,
        expired: false,
        exhausted: verification.attemptsRemaining <= 0,
      };
    }

    const existing = await prisma.emailVerification.findUnique({ where: { userId } });

    if (existing === null) {
      return { verification: null, attemptsRemaining: 0, expired: false, exhausted: false };
    }

    const expired = new Date() > existing.expiresAt;
    const exhausted = existing.attemptsRemaining <= 0;

    return {
      verification: existing,
      attemptsRemaining: existing.attemptsRemaining,
      expired,
      exhausted,
    };
  },

  async deleteByUserId(userId) {
    await getPrisma().emailVerification.delete({ where: { userId } });
  },
};
