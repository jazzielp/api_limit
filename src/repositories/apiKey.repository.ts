import type { ApiKey, Prisma } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";

export interface ApiKeyRepository {
  create(input: Prisma.ApiKeyCreateInput): Promise<ApiKey>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  listActiveByUser(userId: string): Promise<ApiKey[]>;
  revoke(id: string, userId: string): Promise<ApiKey>;
  touch(id: string): Promise<ApiKey>;
  touchIfStale(id: string, minIntervalMs: number): Promise<ApiKey | null>;
}

export const apiKeyRepository: ApiKeyRepository = {
  create(input) {
    return getPrisma().apiKey.create({ data: input });
  },

  findByKeyHash(keyHash) {
    return getPrisma().apiKey.findUnique({ where: { keyHash } });
  },

  listActiveByUser(userId) {
    return getPrisma().apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  revoke(id, userId) {
    return getPrisma().apiKey.update({
      where: { id, userId },
      data: { revokedAt: new Date() },
    });
  },

  touch(id) {
    return getPrisma().apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },

  async touchIfStale(id: string, minIntervalMs: number): Promise<ApiKey | null> {
    const prisma = getPrisma();
    const staleThreshold = new Date(Date.now() - minIntervalMs);

    const result = await prisma.$queryRaw<ApiKey[]>`
      UPDATE "ApiKey"
      SET "lastUsedAt" = NOW()
      WHERE id = ${id}
        AND ("lastUsedAt" IS NULL OR "lastUsedAt" < ${staleThreshold})
      RETURNING *
    `;

    return result[0] ?? null;
  },
};
