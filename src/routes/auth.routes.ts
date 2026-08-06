import { Router } from "express";
import { z } from "zod";
import { authController } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { authRateLimiter } from "../middleware/rateLimitAuth.js";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const verifyEmailSchema = z.object({
  email: z.email(),
  code: z.string().min(6).max(6),
});

const resendVerificationSchema = z.object({
  email: z.email(),
});

const forgotPasswordSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const router: Router = Router();

router.post("/register", authRateLimiter, validate(registerSchema), authController.register);
router.post("/login", authRateLimiter, validate(loginSchema), authController.login);
router.post(
  "/verify-email",
  authRateLimiter,
  validate(verifyEmailSchema),
  authController.verifyEmail,
);
router.post(
  "/resend-verification",
  authRateLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification,
);
router.post(
  "/forgot-password",
  authRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  authRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

export { router as authRouter };
