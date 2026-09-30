import rateLimit from "express-rate-limit";

const common = {
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
};

export const uploadLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { error: { message: "Upload limit reached. Try again shortly." } },
});

export const aiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: { error: { message: "AI request limit reached. Try again shortly." } },
});
