import { z } from "zod";

export const MAIL_DRIVER = {
  CONSOLE: "console",
  SMTP: "smtp",
} as const;

type MailDriver = (typeof MAIL_DRIVER)[keyof typeof MAIL_DRIVER];

export const LOG_LEVEL = {
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
  SILENT: "silent",
} as const;

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

export const TRUST_PROXY = {
  TRUE: "true",
  FALSE: "false",
} as const;

const trustProxySchema = z
  .preprocess(
    (val) => {
      if (val === TRUST_PROXY.TRUE) return true;
      if (val === TRUST_PROXY.FALSE) return false;
      if (typeof val === "string" && val.trim() !== "") {
        const num = Number(val);
        if (!Number.isNaN(num)) return num;
      }
      return val;
    },
    z.union([z.boolean(), z.number(), z.string()]),
  )
  .default(false);

export type TrustProxy = boolean | number | string;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    JWT_ISSUER: z.string().min(1).default("api_limit"),
    JWT_AUDIENCE: z.string().min(1).default("api_limit_users"),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).default(15),
    MAIL_DRIVER: z.enum([MAIL_DRIVER.CONSOLE, MAIL_DRIVER.SMTP]).default(MAIL_DRIVER.CONSOLE),
    MAIL_FROM: z.email().default("noreply@example.com"),
    RESET_PASSWORD_URL: z.url().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    LOG_LEVEL: z
      .enum([
        LOG_LEVEL.TRACE,
        LOG_LEVEL.DEBUG,
        LOG_LEVEL.INFO,
        LOG_LEVEL.WARN,
        LOG_LEVEL.ERROR,
        LOG_LEVEL.FATAL,
        LOG_LEVEL.SILENT,
      ])
      .default(LOG_LEVEL.INFO),
    TRUST_PROXY: trustProxySchema,
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === "production" &&
      (data.RESET_PASSWORD_URL === undefined || data.RESET_PASSWORD_URL.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "RESET_PASSWORD_URL is required in production",
        path: ["RESET_PASSWORD_URL"],
      });
    }

    if (
      data.MAIL_DRIVER === MAIL_DRIVER.SMTP &&
      (data.SMTP_HOST === undefined || data.SMTP_HOST.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SMTP_HOST is required when MAIL_DRIVER=smtp",
        path: ["SMTP_HOST"],
      });
    }

    if (data.MAIL_DRIVER === MAIL_DRIVER.SMTP && data.SMTP_PORT === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SMTP_PORT is required when MAIL_DRIVER=smtp",
        path: ["SMTP_PORT"],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodError["issues"],
  ) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new ConfigurationError("Invalid environment configuration", parsed.error.issues);
  }

  return parsed.data;
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (cachedEnv === undefined) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = undefined;
}

export function getMailDriver(env: Env): MailDriver {
  return env.MAIL_DRIVER;
}
