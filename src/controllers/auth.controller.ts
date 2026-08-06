import type { Request, Response } from "express";
import { authService } from "../services/auth.service.js";

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body);
    return res.status(201).json(result);
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body);
    return res.status(200).json(result);
  },

  async verifyEmail(req: Request, res: Response) {
    await authService.verifyEmail(req.body);
    return res.status(200).json({ message: "Email verified" });
  },

  async resendVerification(req: Request, res: Response) {
    await authService.resendVerification(req.body);
    return res
      .status(200)
      .json({ message: "If your email is registered, a new code has been sent" });
  },

  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword(req.body);
    return res.status(204).send();
  },

  async resetPassword(req: Request, res: Response) {
    await authService.resetPassword(req.body);
    return res.status(204).send();
  },
};
