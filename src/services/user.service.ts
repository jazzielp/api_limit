import { AppError, ERROR_CODE, isRecordNotFoundError } from "../lib/errors.js";
import { hashPassword, verifyPassword } from "../lib/crypto.js";
import type { UserRepository } from "../repositories/user.repository.js";
import { userRepository } from "../repositories/user.repository.js";

export interface UpdateProfileInput {
  name?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface UserServiceDeps {
  userRepository: UserRepository;
  hashPassword: (plain: string) => Promise<string>;
  verifyPassword: (hash: string, plain: string) => Promise<boolean>;
}

export function createUserService(deps: UserServiceDeps) {
  async function getProfile(userId: string) {
    const user = await deps.userRepository.findById(userId);

    if (user === null) {
      throw new AppError(404, "User not found", ERROR_CODE.NOT_FOUND);
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async function updateProfile(userId: string, input: UpdateProfileInput) {
    try {
      const user = await deps.userRepository.update(userId, {
        name: input.name,
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new AppError(404, "User not found", ERROR_CODE.NOT_FOUND);
      }
      throw error;
    }
  }

  async function changePassword(userId: string, input: ChangePasswordInput) {
    const user = await deps.userRepository.findById(userId);

    if (user === null) {
      throw new AppError(404, "User not found", ERROR_CODE.NOT_FOUND);
    }

    const valid = await deps.verifyPassword(user.passwordHash, input.currentPassword);

    if (!valid) {
      throw new AppError(401, "Invalid current password", ERROR_CODE.UNAUTHORIZED);
    }

    const newPasswordHash = await deps.hashPassword(input.newPassword);
    await deps.userRepository.updatePasswordAndIncrementTokenVersion(userId, newPasswordHash);
  }

  return { getProfile, updateProfile, changePassword };
}

export const userService = createUserService({
  userRepository,
  hashPassword,
  verifyPassword,
});
