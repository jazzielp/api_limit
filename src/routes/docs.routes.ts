import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import helmet from "helmet";
import { apiReference } from "@scalar/express-api-reference";
import { openApiDocument } from "../openapi.js";

const router: Router = Router();
const SCALAR_CDN_URL = "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.64.1";

router.get("/openapi.json", (_req, res) => res.status(200).json(openApiDocument));
router.get(
  ["/docs", "/docs/"],
  (req, res, next) => {
    const nonce = randomBytes(32).toString("base64");
    res.locals.cspNonce = nonce;
    helmet.contentSecurityPolicy({
      directives: {
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", `'nonce-${nonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    })(req, res, next);
  },
  (req, res, next) => {
    apiReference({
      url: "/openapi.json",
      cdn: SCALAR_CDN_URL,
      nonce: res.locals.cspNonce,
    })(req as Request<never>, res, next);
  },
);

export { router as docsRouter };
