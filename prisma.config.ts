import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "@prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NODE_ENV = process.env.NODE_ENV ?? "development";
const envFile =
  NODE_ENV === "production" ? ".env" : NODE_ENV === "test" ? ".env.test" : ".env.development";

config({ path: path.resolve(__dirname, envFile) });

const connectionString = process.env.DATABASE_URL ?? "";

export default defineConfig({
  experimental: {
    adapter: true,
  },
  engine: "js",
  schema: path.join(__dirname, "prisma/schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma/migrations"),
  },
  async adapter() {
    return new PrismaPg({
      connectionString,
    });
  },
});
