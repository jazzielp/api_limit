import type { Prisma, User } from "@prisma/client";
import { getPrisma } from "../db/prisma.js";

export interface UserRepository {
  create(input: Prisma.UserCreateInput): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  update(id: string, input: Prisma.UserUpdateInput): Promise<User>;
  markEmailVerified(id: string): Promise<User>;
  updatePasswordAndIncrementTokenVersion(id: string, passwordHash: string): Promise<User>;
  incrementTokenVersion(id: string): Promise<User>;
}

export const userRepository: UserRepository = {
  create(input) {
    return getPrisma().user.create({ data: input });
  },

  findByEmail(email) {
    return getPrisma().user.findUnique({ where: { email } });
  },

  findById(id) {
    return getPrisma().user.findUnique({ where: { id } });
  },

  update(id, input) {
    return getPrisma().user.update({ where: { id }, data: input });
  },

  markEmailVerified(id) {
    return getPrisma().user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  },

  updatePasswordAndIncrementTokenVersion(id, passwordHash) {
    return getPrisma().user.update({
      where: { id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
    });
  },

  incrementTokenVersion(id) {
    return getPrisma().user.update({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
    });
  },
};
