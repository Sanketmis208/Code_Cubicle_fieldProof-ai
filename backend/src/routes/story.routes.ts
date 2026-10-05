import { Router } from "express";
import { z } from "zod";
import { composeStory, listStories } from "../controllers/story.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";

export const storyRouter = Router();
storyRouter.get("/", validate(z.object({ query: z.object({ projectId: z.string().cuid().optional() }) })), asyncHandler(listStories));
storyRouter.post(
  "/",
  validate(z.object({
    body: z.object({
      kind: z.enum(["SQUARE_CARD", "STORY", "BEFORE_AFTER"]),
      assetIds: z.array(z.string().cuid()).min(1).max(2),
      headline: z.string().trim().min(3).max(90),
      subline: z.string().trim().max(120).optional(),
      // Faces are blurred unless the caller explicitly opts out.
      blurFaces: z.boolean().default(true),
    }),
  })),
  asyncHandler(composeStory),
);
