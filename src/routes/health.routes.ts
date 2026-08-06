import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";

const router: Router = Router();

router.get("/", healthController.ok);
router.get("/ready", healthController.ready);

export { router as healthRouter };
