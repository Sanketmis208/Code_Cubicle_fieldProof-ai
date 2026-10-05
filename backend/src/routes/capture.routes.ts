import { Router } from "express";
import { z } from "zod";
import { captureProjects, registerDevice, serverTime, uploadCapture } from "../controllers/capture.controller.js";
import { uploadLimiter } from "../middleware/rate-limits.js";
import { uploadMediaSingle } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";

export const captureRouter = Router();
captureRouter.get("/time", serverTime);
captureRouter.get("/projects", asyncHandler(captureProjects));
captureRouter.post(
  "/devices",
  validate(z.object({
    body: z.object({
      publicKey: z.string().min(40).max(64),
      platform: z.enum(["android", "ios", "web"]),
      model: z.string().trim().max(120).optional(),
      appVersion: z.string().trim().max(40).optional(),
    }),
  })),
  asyncHandler(registerDevice),
);
captureRouter.post("/upload", uploadLimiter, uploadMediaSingle, asyncHandler(uploadCapture));
