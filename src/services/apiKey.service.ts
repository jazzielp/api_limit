import { AppError, ERROR_CODE, isRecordNotFoundError } from "../lib/errors.js";
import { generateApiKey, hashApiKey } from "../lib/crypto.js";
import type { ApiKeyRepository } from "../repositories/apiKey.repository.js";
import { apiKeyRepository } from "../repositories/apiKey.repository.js";

const LAST_USED_THROTTLE_MS = 60_000;

export interface ApiKeyServiceDeps {
  apiKeyRepository: ApiKeyRepository;
  generateApiKey: () => string;
  hashApiKey: (key: string) => string;
  lastUsedThrottleMs: number;
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
}

export function createApiKeyService(deps: ApiKeyServiceDeps) {
  async function create(input: CreateApiKeyInput) {
    const key = deps.generateApiKey();
    const keyHash = deps.hashApiKey(key);

    const record = await deps.apiKeyRepository.create({
      user: { connect: { id: input.userId } },
      name: input.name,
      keyHash,
    });

    return {
      id: record.id,
      name: record.name,
      key,
      createdAt: record.createdAt,
    };
  }

  async function list(userId: string) {
    const keys = await deps.apiKeyRepository.listActiveByUser(userId);

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
    }));
  }

  async function revoke(userId: string, keyId: string) {
    try {
      await deps.apiKeyRepository.revoke(keyId, userId);
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new AppError(404, "API key not found", ERROR_CODE.NOT_FOUND);
      }
      throw error;
    }
  }

  async function authenticate(key: string) {
    const keyHash = deps.hashApiKey(key);
    const record = await deps.apiKeyRepository.findByKeyHash(keyHash);

    if (record === null || record.revokedAt !== null) {
      throw new AppError(401, "Invalid API key", ERROR_CODE.UNAUTHORIZED);
    }

    await deps.apiKeyRepository.touchIfStale(record.id, deps.lastUsedThrottleMs);

    return { userId: record.userId };
  }

  return { create, list, revoke, authenticate };
}

export const apiKeyService = createApiKeyService({
  apiKeyRepository,
  generateApiKey,
  hashApiKey,
  lastUsedThrottleMs: LAST_USED_THROTTLE_MS,
});
