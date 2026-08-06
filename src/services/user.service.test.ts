import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { User } from "@prisma/client";
import { createUserService } from "./user.service.js";
import { AppError, ERROR_CODE } from "../lib/errors.js";

const baseUser = {
  id: "user-1",
  email: "alice@example.com",
  passwordHash: "hashed-password",
  name: "Alice",
  emailVerifiedAt: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
} satisfies User;

function createMockDeps() {
  return {
    userRepository: {
      findById: vi.fn(),
      update: vi.fn(),
      updatePasswordAndIncrementTokenVersion: vi.fn(),
    },
    hashPassword: vi.fn(),
    verifyPassword: vi.fn(),
  };
}

describe("UserService", () => {
  it("returns the user profile", async () => {
    const deps = createMockDeps();
    const service = createUserService(deps as ReturnType<typeof createMockDeps>);

    deps.userRepository.findById.mockResolvedValue(baseUser);

    const result = await service.getProfile("user-1");

    expect(result.id).toBe("user-1");
    expect(result.email).toBe("alice@example.com");
  });

  it("throws a 404 when the user is not found", async () => {
    const deps = createMockDeps();
    const service = createUserService(deps as ReturnType<typeof createMockDeps>);

    deps.userRepository.findById.mockResolvedValue(null);

    await expect(service.getProfile("user-1")).rejects.toThrow(
      new AppError(404, "User not found", ERROR_CODE.NOT_FOUND),
    );
  });

  it("updates the user profile", async () => {
    const deps = createMockDeps();
    const service = createUserService(deps as ReturnType<typeof createMockDeps>);

    deps.userRepository.update.mockResolvedValue({ ...baseUser, name: "Alice Smith" });

    const result = await service.updateProfile("user-1", { name: "Alice Smith" });

    expect(result.name).toBe("Alice Smith");
    expect(deps.userRepository.update).toHaveBeenCalledWith("user-1", { name: "Alice Smith" });
  });

  it("translates a Prisma P2025 record-not-found error into a 404 response", async () => {
    const deps = createMockDeps();
    const service = createUserService(deps as ReturnType<typeof createMockDeps>);

    deps.userRepository.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "7.0.0",
      }),
    );

    await expect(service.updateProfile("user-1", { name: "Alice" })).rejects.toThrow(
      new AppError(404, "User not found", ERROR_CODE.NOT_FOUND),
    );
  });

  it("changes the password when the current password is valid", async () => {
    const deps = createMockDeps();
    const service = createUserService(deps as ReturnType<typeof createMockDeps>);

    deps.userRepository.findById.mockResolvedValue(baseUser);
    deps.verifyPassword.mockResolvedValue(true);
    deps.hashPassword.mockResolvedValue("new-hash");

    await service.changePassword("user-1", {
      currentPassword: "OldPassword123",
      newPassword: "NewPassword123",
    });

    expect(deps.userRepository.updatePasswordAndIncrementTokenVersion).toHaveBeenCalledWith(
      "user-1",
      "new-hash",
    );
  });

  it("rejects a password change with an invalid current password", async () => {
    const deps = createMockDeps();
    const service = createUserService(deps as ReturnType<typeof createMockDeps>);

    deps.userRepository.findById.mockResolvedValue(baseUser);
    deps.verifyPassword.mockResolvedValue(false);

    await expect(
      service.changePassword("user-1", {
        currentPassword: "wrong",
        newPassword: "NewPassword123",
      }),
    ).rejects.toThrow(new AppError(401, "Invalid current password", ERROR_CODE.UNAUTHORIZED));
  });
});
