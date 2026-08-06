import type { Request, Response } from "express";
import { userService } from "../services/user.service.js";

export const userController = {
  async getMe(req: Request, res: Response) {
    const result = await userService.getProfile(req.user!.userId);
    return res.status(200).json(result);
  },

  async updateMe(req: Request, res: Response) {
    const result = await userService.updateProfile(req.user!.userId, req.body);
    return res.status(200).json(result);
  },

  async changePassword(req: Request, res: Response) {
    await userService.changePassword(req.user!.userId, req.body);
    return res.status(204).send();
  },
};
