import { Router } from "express";
import { z } from "zod";
import { checkClaim } from "../controllers/claims.controller.js";
import { aiLimiter } from "../middleware/rate-limits.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";

export const claimsRouter = Router();
claimsRouter.post(
  "/check",
  aiLimiter,
  validate(z.object({ body: z.object({ claim: z.string().trim().min(8).max(600), projectId: z.string().cuid().optional() }) })),
  asyncHandler(checkClaim),
);
