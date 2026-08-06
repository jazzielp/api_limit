import type { Transporter } from "nodemailer";
import { createTransport } from "nodemailer";
import type { Env } from "../config/env.js";

export interface SendVerificationCodePayload {
  userId: string;
  email: string;
  code: string;
}

export interface SendPasswordResetPayload {
  userId: string;
  email: string;
  token: string;
  resetUrl: string;
}

export interface Mailer {
  sendVerificationCode(payload: SendVerificationCodePayload): Promise<void>;
  sendPasswordReset(payload: SendPasswordResetPayload): Promise<void>;
}

export const consoleMailer: Mailer = {
  async sendVerificationCode(payload) {
    // eslint-disable-next-line no-console
    console.info(`[verification code] ${payload.email}: ${payload.code}`);
  },
  async sendPasswordReset(payload) {
    // eslint-disable-next-line no-console
    console.info(`[password reset] ${payload.email}: ${payload.resetUrl}`);
  },
};

export function createSmtpMailer(env: Env): Mailer {
  const transportOptions = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER !== undefined && env.SMTP_USER.length > 0
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
        : undefined,
  };

  const transporter: Transporter = createTransport(transportOptions);

  return {
    async sendVerificationCode(payload) {
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to: payload.email,
        subject: "Your verification code",
        text: `Your verification code is: ${payload.code}\n\nThis code expires in 30 minutes.`,
        html: `<p>Your verification code is: <strong>${payload.code}</strong></p><p>This code expires in 30 minutes.</p>`,
      });
    },
    async sendPasswordReset(payload) {
      await transporter.sendMail({
        from: env.MAIL_FROM,
        to: payload.email,
        subject: "Password reset request",
        text: `Reset your password by visiting:\n\n${payload.resetUrl}\n\nThis link expires in 15 minutes and can only be used once.`,
        html: `<p>Reset your password by clicking the link below:</p><p><a href="${payload.resetUrl}">${payload.resetUrl}</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
      });
    },
  };
}
