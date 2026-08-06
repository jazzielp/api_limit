import { describe, it, expect, vi } from "vitest";
import { Prisma, type ApiKey } from "@prisma/client";
import { createApiKeyService } from "./apiKey.service.js";
import { AppError, ERROR_CODE } from "../lib/errors.js";

function createMockDeps() {
  return {
    apiKeyRepository: {
      create: vi.fn(),
      findByKeyHash: vi.fn(),
      listActiveByUser: vi.fn(),
      revoke: vi.fn(),
      touch: vi.fn(),
      touchIfStale: vi.fn(),
    },
    generateApiKey: vi.fn(),
    hashApiKey: vi.fn(),
    lastUsedThrottleMs: 60_000,
  };
}

describe("ApiKeyService", () => {
  it("returns the plaintext key only once and stores its hash", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    deps.generateApiKey.mockReturnValue("apk_plaintext");
    deps.hashApiKey.mockReturnValue("hashed-key");
    deps.apiKeyRepository.create.mockResolvedValue({
      id: "key-1",
      name: "My key",
      keyHash: "hashed-key",
      userId: "user-1",
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as ApiKey);

    const result = await service.create({ userId: "user-1", name: "My key" });

    expect(result.key).toBe("apk_plaintext");
    expect(result.name).toBe("My key");
    expect(deps.apiKeyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        keyHash: "hashed-key",
      }),
    );
  });

  it("authenticates an active key and rejects a revoked key", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    deps.hashApiKey.mockReturnValue("hashed-key");
    deps.apiKeyRepository.findByKeyHash.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      keyHash: "hashed-key",
      name: "key",
      revokedAt: new Date("2026-01-01T00:00:00Z"),
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as ApiKey);

    await expect(service.authenticate("apk_test")).rejects.toThrow(
      new AppError(401, "Invalid API key", ERROR_CODE.UNAUTHORIZED),
    );
  });

  it("updates lastUsedAt only when the key is stale", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    deps.hashApiKey.mockReturnValue("hashed-key");
    deps.apiKeyRepository.findByKeyHash.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      keyHash: "hashed-key",
      name: "key",
      revokedAt: null,
      lastUsedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as ApiKey);
    deps.apiKeyRepository.touchIfStale.mockResolvedValue(null);

    await service.authenticate("apk_test");

    expect(deps.apiKeyRepository.touchIfStale).toHaveBeenCalledWith("key-1", 60_000);
    expect(deps.apiKeyRepository.touchIfStale).toHaveBeenCalledTimes(1);
  });

  it("returns the userId after touching a stale key", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    deps.hashApiKey.mockReturnValue("hashed-key");
    deps.apiKeyRepository.findByKeyHash.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      keyHash: "hashed-key",
      name: "key",
      revokedAt: null,
      lastUsedAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as ApiKey);
    deps.apiKeyRepository.touchIfStale.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      name: "key",
      keyHash: "hashed-key",
      revokedAt: null,
      lastUsedAt: new Date("2026-01-02T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as ApiKey);

    const result = await service.authenticate("apk_test");

    expect(result.userId).toBe("user-1");
    expect(deps.apiKeyRepository.touchIfStale).toHaveBeenCalledWith("key-1", 60_000);
  });

  it("lists active keys for a user", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    const createdAt = new Date("2026-01-01T00:00:00Z");
    deps.apiKeyRepository.listActiveByUser.mockResolvedValue([
      {
        id: "key-1",
        userId: "user-1",
        name: "Test",
        keyHash: "hash",
        revokedAt: null,
        lastUsedAt: null,
        createdAt,
      } as ApiKey,
    ]);

    const result = await service.list("user-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("key-1");
  });

  it("revokes a key by id and user", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    deps.apiKeyRepository.revoke.mockResolvedValue({ id: "key-1" } as ApiKey);

    await service.revoke("user-1", "key-1");

    expect(deps.apiKeyRepository.revoke).toHaveBeenCalledWith("key-1", "user-1");
  });

  it("translates a Prisma P2025 record-not-found error into a 404 response", async () => {
    const deps = createMockDeps();
    const service = createApiKeyService(deps as ReturnType<typeof createMockDeps>);

    deps.apiKeyRepository.revoke.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "7.0.0",
      }),
    );

    await expect(service.revoke("user-1", "key-1")).rejects.toThrow(
      new AppError(404, "API key not found", ERROR_CODE.NOT_FOUND),
    );
  });
});
