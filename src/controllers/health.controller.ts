import type { Request, Response } from "express";
import { getPrisma } from "../db/prisma.js";

export const healthController = {
  ok(_req: Request, res: Response) {
    return res.status(200).json({ status: "ok" });
  },

  async ready(req: Request, res: Response) {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      return res.status(200).json({ status: "ready", checks: { database: "ok" } });
    } catch (error) {
      req.log.error(error, "Readiness check failed");
      return res.status(503).json({ status: "not ready", checks: { database: "unavailable" } });
    }
  },
};
