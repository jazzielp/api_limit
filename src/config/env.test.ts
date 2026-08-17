import { describe, it, expect, beforeEach } from "vitest";
import { envSchema, loadEnv, resetEnvCache, ConfigurationError } from "./env.js";

describe("envSchema", () => {
  const validEnv = {
    NODE_ENV: "test",
    PORT: "3001",
    DATABASE_URL: "postgresql://api_limit:api_limit@localhost:5432/api_limit_test",
    JWT_SECRET: "test-secret-must-be-at-least-32-characters-long",
    JWT_ISSUER: "api_limit_test",
    JWT_AUDIENCE: "api_limit_test_users",
    ACCESS_TOKEN_TTL_MINUTES: "15",
    MAIL_DRIVER: "console",
    MAIL_FROM: "test@example.com",
    RESET_PASSWORD_URL: "http://localhost:3001/reset-password",
    OEPNIA_API_KEY: "test-openai-api-key",
    OPENIA_MODEL: "gpt-5-mini",
    LOG_LEVEL: "silent",
  } as const;

  it("accepts a valid test environment", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      JWT_SECRET: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid NODE_ENV", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: "staging",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email sender", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      MAIL_FROM: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("requires RESET_PASSWORD_URL in production", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: "production",
      RESET_PASSWORD_URL: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("requires SMTP_HOST when MAIL_DRIVER is smtp", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      MAIL_DRIVER: "smtp",
      SMTP_HOST: undefined,
      SMTP_PORT: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("accepts silent as a test-safe LOG_LEVEL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      LOG_LEVEL: "silent",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LOG_LEVEL).toBe("silent");
    }
  });

  it("rejects an invalid LOG_LEVEL", () => {
    const result = envSchema.safeParse({
      ...validEnv,
      LOG_LEVEL: "verbose",
    });
    expect(result.success).toBe(false);
  });

  it("defaults TRUST_PROXY to false", () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TRUST_PROXY).toBe(false);
    }
  });

  it("accepts boolean, numeric, and string TRUST_PROXY values", () => {
    expect(envSchema.safeParse({ ...validEnv, TRUST_PROXY: "true" }).success).toBe(true);
    expect(envSchema.safeParse({ ...validEnv, TRUST_PROXY: "1" }).success).toBe(true);
    expect(envSchema.safeParse({ ...validEnv, TRUST_PROXY: "loopback" }).success).toBe(true);
  });
});

describe("loadEnv", () => {
  beforeEach(() => {
    resetEnvCache();
  });

  it("returns parsed env when valid", () => {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = "postgresql://localhost/api_limit_test";
    process.env.JWT_SECRET = "test-secret-must-be-at-least-32-characters-long";
    process.env.RESET_PASSWORD_URL = "http://localhost:3000/reset-password";
    process.env.OEPNIA_API_KEY = "test-openai-api-key";
    process.env.OPENIA_MODEL = "gpt-5-mini";

    const env = loadEnv();
    expect(env.NODE_ENV).toBe("test");
  });

  it("throws ConfigurationError when invalid", () => {
    process.env.NODE_ENV = "invalid";

    expect(() => loadEnv()).toThrow(ConfigurationError);
  });
});
