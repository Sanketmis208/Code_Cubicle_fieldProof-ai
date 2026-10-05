import { Router } from "express";
import { z } from "zod";
import { reviewAsset, reviewCluster, reviewQueue } from "../controllers/review.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";

const decision = z.enum(["APPROVED", "REJECTED", "RESHOOT_REQUESTED"]);
const decisionBody = z.object({ decision, note: z.string().trim().max(500).optional() });

export const reviewRouter = Router();
reviewRouter.get(
  "/queue",
  validate(z.object({ query: z.object({ projectId: z.string().cuid().optional(), status: z.enum(["PENDING", "APPROVED", "REJECTED", "RESHOOT_REQUESTED"]).optional() }) })),
  asyncHandler(reviewQueue),
);
reviewRouter.post("/assets/:id", validate(z.object({ params: z.object({ id: z.string().cuid() }), body: decisionBody })), asyncHandler(reviewAsset));
reviewRouter.post("/events/:id", validate(z.object({ params: z.object({ id: z.string().cuid() }), body: decisionBody })), asyncHandler(reviewCluster));
