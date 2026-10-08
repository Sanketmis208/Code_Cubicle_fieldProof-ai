import { Router } from "express";
import { z } from "zod";
import { chat } from "../controllers/assistant.controller.js";
import { aiLimiter } from "../middleware/rate-limits.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";

export const assistantRouter = Router();
assistantRouter.post(
  "/chat",
  aiLimiter,
  validate(z.object({
    body: z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(20),
    }),
  })),
  asyncHandler(chat),
);
