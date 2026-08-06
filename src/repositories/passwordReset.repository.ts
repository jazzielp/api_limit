import type { PasswordReset } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";

export interface CreatePasswordResetInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface PasswordResetRepository {
  create(input: CreatePasswordResetInput): Promise<PasswordReset>;
  createLatestForUser(input: CreatePasswordResetInput): Promise<PasswordReset>;
  findByTokenHash(tokenHash: string): Promise<PasswordReset | null>;
  findLatestUnusedByUser(userId: string): Promise<PasswordReset | null>;
  markUsed(id: string): Promise<PasswordReset>;
  deleteUnusedByUser(userId: string): Promise<void>;
  consumeAndUpdatePassword(
    tokenHash: string,
    passwordHash: string,
  ): Promise<{
    reset: PasswordReset;
    user: { id: string; email: string; tokenVersion: number };
  } | null>;
}

export const passwordResetRepository: PasswordResetRepository = {
  create(input) {
    return getPrisma().passwordReset.create({
      data: {
        user: { connect: { id: input.userId } },
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  },

  async createLatestForUser(input) {
    const prisma = getPrisma();

    return prisma.$transaction(async (tx) => {
      await tx.passwordReset.deleteMany({
        where: { userId: input.userId, usedAt: null },
      });

      return tx.passwordReset.create({
        data: {
          user: { connect: { id: input.userId } },
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
    });
  },

  findByTokenHash(tokenHash) {
    return getPrisma().passwordReset.findUnique({ where: { tokenHash } });
  },

  findLatestUnusedByUser(userId) {
    return getPrisma().passwordReset.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  },

  markUsed(id) {
    return getPrisma().passwordReset.update({ where: { id }, data: { usedAt: new Date() } });
  },

  async deleteUnusedByUser(userId) {
    await getPrisma().passwordReset.deleteMany({
      where: { userId, usedAt: null },
    });
  },

  async consumeAndUpdatePassword(tokenHash: string, passwordHash: string) {
    const prisma = getPrisma();

    return prisma.$transaction(async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash },
      });

      if (reset === null || reset.usedAt !== null || reset.expiresAt <= new Date()) {
        return null;
      }

      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      const user = await tx.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });

      return {
        reset,
        user: {
          id: user.id,
          email: user.email,
          tokenVersion: user.tokenVersion,
        },
      };
    });
  },
};
