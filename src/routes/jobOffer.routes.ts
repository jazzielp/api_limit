import { Router } from "express";
import { z } from "zod";
import { jobOfferController } from "../controllers/jobOffer.controller.js";
import { validate } from "../middleware/validate.js";

const parseJobOfferSchema = z.object({
  text: z.string().min(1).max(20000),
});

const router: Router = Router();

router.post("/parse", validate(parseJobOfferSchema), jobOfferController.parse);

export { router as jobOfferRouter };
