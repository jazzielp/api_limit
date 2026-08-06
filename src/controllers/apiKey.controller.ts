import type { Request, Response } from "express";
import { apiKeyService } from "../services/apiKey.service.js";

export const apiKeyController = {
  async create(req: Request, res: Response) {
    const result = await apiKeyService.create({
      userId: req.user!.userId,
      name: req.body.name,
    });
    return res.status(201).json(result);
  },

  async list(req: Request, res: Response) {
    const result = await apiKeyService.list(req.user!.userId);
    return res.status(200).json(result);
  },

  async revoke(req: Request, res: Response) {
    await apiKeyService.revoke(req.user!.userId, String(req.params.id));
    return res.status(204).send();
  },
};
