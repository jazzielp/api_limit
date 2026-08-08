import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "../openapi.js";

const router: Router = Router();

router.get("/openapi.json", (_req, res) => res.status(200).json(openApiDocument));
router.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: "api_limit API documentation",
    swaggerOptions: {
      url: "/openapi.json",
      validatorUrl: null,
    },
  }),
);

export { router as docsRouter };
