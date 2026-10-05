import { z } from "zod";

export const assetIdSchema = z.object({
  params: z.object({ id: z.string().cuid() }),
});
export const listAssetsSchema = z.object({
  query: z.object({
    projectId: z.string().cuid().optional(),
    resourceType: z.enum(["IMAGE", "VIDEO", "RAW"]).optional(),
    activity: z.string().trim().max(160).optional(),
    search: z.string().trim().max(120).optional(),
    favorite: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sort: z.enum(["newest", "oldest", "filename"]).default("newest"),
    trustStatus: z.enum(["NOT_ASSESSED", "STRONG", "MODERATE", "NEEDS_SECOND_LOOK"]).optional(),
    reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "RESHOOT_REQUESTED"]).optional(),
    captureSource: z.enum(["WEB_UPLOAD", "WEB_LIVE_CAPTURE", "APP_CAPTURE"]).optional(),
    from: z.coerce.date().transform((date) => {
      date.setUTCHours(0, 0, 0, 0);
      return date;
    }).optional(),
    to: z.coerce.date().transform((date) => {
      date.setUTCHours(23, 59, 59, 999);
      return date;
    }).optional(),
    page: z.coerce.number().int().positive().default(1),
    // 100 lets pickers (e.g. comparisons) offer recent evidence in one request.
    limit: z.coerce.number().int().min(1).max(100).default(24),
  }),
});
export const favoriteAssetSchema = z.object({
  params: z.object({ id: z.string().cuid() }),
  body: z.object({ favorite: z.boolean() }),
});
export const analyzeAssetSchema = z.object({
  params: z.object({ id: z.string().cuid() }),
  body: z.object({ force: z.boolean().optional() }).default({}),
});
export const naturalLanguageSearchSchema = z.object({
  body: z.object({
    query: z.string().trim().min(3).max(500),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(48).default(24),
  }),
});
