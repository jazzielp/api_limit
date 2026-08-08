import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL ?? "";

export default defineConfig({
  experimental: {
    adapter: true,
  },
  engine: "js",
  schema: path.join(__dirname, "prisma/schema.prisma"),
  datasource: {
    url: connectionString,
  },
  migrations: {
    path: path.join(__dirname, "prisma/migrations"),
  },
  async adapter() {
    return new PrismaPg({
      connectionString,
    });
  },
});
