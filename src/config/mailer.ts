import { consoleMailer, createSmtpMailer, type Mailer } from "../lib/mailer.js";
import { getEnv, MAIL_DRIVER } from "./env.js";

export function createMailer(): Mailer {
  const env = getEnv();

  if (env.MAIL_DRIVER === MAIL_DRIVER.SMTP) {
    if (env.SMTP_HOST === undefined || env.SMTP_HOST.length === 0) {
      throw new Error("SMTP_HOST is required when MAIL_DRIVER=smtp");
    }
    if (env.SMTP_PORT === undefined) {
      throw new Error("SMTP_PORT is required when MAIL_DRIVER=smtp");
    }
    return createSmtpMailer(env);
  }

  return consoleMailer;
}

let cachedMailer: Mailer | undefined;

export function getMailer(): Mailer {
  if (cachedMailer === undefined) {
    cachedMailer = createMailer();
  }
  return cachedMailer;
}

export function resetMailerCache(): void {
  cachedMailer = undefined;
}
