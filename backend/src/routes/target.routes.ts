import { Router } from "express";
import { z } from "zod";
import { addTally, createTarget, deleteTarget, listTargets, reviewTally } from "../controllers/target.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";

const id = z.string().cuid();

/** Mounted under /projects/:id/targets. */
export const projectTargetRouter = Router({ mergeParams: true });
projectTargetRouter.get("/", validate(z.object({ params: z.object({ id }) })), asyncHandler(listTargets));
projectTargetRouter.post(
  "/",
  validate(z.object({
    params: z.object({ id }),
    body: z.object({
      label: z.string().trim().min(2).max(120),
      unit: z.string().trim().min(1).max(40),
      targetCount: z.number().int().min(1).max(10_000_000),
      dueDate: z.coerce.date().optional().nullable(),
    }),
  })),
  asyncHandler(createTarget),
);
projectTargetRouter.delete("/:targetId", validate(z.object({ params: z.object({ id, targetId: id }) })), asyncHandler(deleteTarget));

/** Mounted under /targets. */
export const targetRouter = Router();
targetRouter.post(
  "/:targetId/tallies",
  validate(z.object({
    params: z.object({ targetId: id }),
    body: z.object({
      count: z.number().int().min(1).max(1_000_000),
      recordedAt: z.string().datetime().optional(),
      siteId: id.optional(),
      eventClusterId: id.optional(),
      note: z.string().trim().max(300).optional(),
    }),
  })),
  asyncHandler(addTally),
);
targetRouter.post(
  "/tallies/:tallyId/review",
  validate(z.object({ params: z.object({ tallyId: id }), body: z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }) })),
  asyncHandler(reviewTally),
);
