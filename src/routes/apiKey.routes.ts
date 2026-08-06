import { Router } from "express";
import { z } from "zod";
import { apiKeyController } from "../controllers/apiKey.controller.js";
import { validate } from "../middleware/validate.js";

const createApiKeySchema = z.object({
  name: z.string().min(1),
});

const router: Router = Router();

router.post("/", validate(createApiKeySchema), apiKeyController.create);
router.get("/", apiKeyController.list);
router.delete("/:id", apiKeyController.revoke);

export { router as apiKeyRouter };
