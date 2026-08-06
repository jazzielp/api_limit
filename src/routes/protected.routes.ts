import { Router } from "express";
import { protectedController } from "../controllers/protected.controller.js";

const router: Router = Router();

router.get("/", protectedController.ok);

export { router as protectedRouter };
