import { Router } from "express";
import { z } from "zod";
import { userController } from "../controllers/user.controller.js";
import { validate } from "../middleware/validate.js";

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const router: Router = Router();

router.get("/me", userController.getMe);
router.patch("/me", validate(updateProfileSchema), userController.updateMe);
router.post("/me/change-password", validate(changePasswordSchema), userController.changePassword);

export { router as userRouter };
