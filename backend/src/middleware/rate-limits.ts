import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { env } from "../config/env.js";

const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  // The automated test suite makes hundreds of requests from one IP.
  skip: () => env.NODE_ENV === "test",
  // Per signed-in user, not per IP: a whole NGO office or a demo venue often
  // shares one IP, and back-to-back rehearsals must not lock everyone out.
  keyGenerator: (req: import("express").Request) => req.userId ?? ipKeyGenerator(req.ip ?? "unknown"),
};

export const uploadLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: { message: "Upload limit reached. Try again shortly." } },
});

export const aiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 120,
  message: { error: { message: "AI request limit reached. Try again shortly." } },
});

/** Invite codes are short enough to type, so guessing must be throttled. */
export const inviteJoinLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: { message: "Too many invite attempts. Try again in a few minutes." } },
});
