import { createHash } from "node:crypto";
import { getPrisma } from "../db/prisma.js";

export interface RateLimitConsumeResult {
  count: number;
  previousCount: number | null;
}

export interface RateLimitRepository {
  consume(userId: string, date: string, dailyLimit: number): Promise<RateLimitConsumeResult>;
}

function advisoryLockId(userId: string, date: string): bigint {
  const hash = createHash("sha256").update(`${userId}:${date}`).digest("hex");
  return BigInt.asIntN(63, BigInt(`0x${hash.slice(0, 16)}`));
}

export const rateLimitRepository: RateLimitRepository = {
  async consume(userId, date, dailyLimit) {
    const prisma = getPrisma();
    const lockId = advisoryLockId(userId, date);

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockId})`;

      const existing = await tx.$queryRaw<{ count: number }[]>`
        SELECT count
        FROM "DailyRateLimit"
        WHERE "userId" = ${userId}
          AND "date" = ${date}::date
      `;

      const previousCount = existing[0]?.count ?? null;

      if (previousCount !== null && previousCount >= dailyLimit) {
        return { count: previousCount, previousCount };
      }

      const result = await tx.$queryRaw<{ count: number }[]>`
        INSERT INTO "DailyRateLimit" ("userId", "date", count)
        VALUES (${userId}, ${date}::date, 1)
        ON CONFLICT ("userId", "date")
        DO UPDATE SET count = "DailyRateLimit".count + 1
        RETURNING count
      `;

      return {
        count: result[0]?.count ?? (previousCount ?? 0) + 1,
        previousCount,
      };
    });
  },
};
