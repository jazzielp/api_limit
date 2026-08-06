import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../config/env.js";

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (prisma === undefined) {
    const env = getEnv();
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
    });

    prisma = new PrismaClient({
      adapter,
      log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }

  return prisma;
}

export function closePrisma(): Promise<void> | undefined {
  return prisma?.$disconnect();
}
