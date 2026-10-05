import { Router } from "express";
import {
  analyzeAsset,
  deleteAsset,
  getAsset,
  listAssets,
  naturalLanguageSearch,
  retryAssetAnalysis,
  setFavorite,
  uploadAssets,
} from "../controllers/asset.controller.js";
import { uploadMedia } from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  assetIdSchema,
  analyzeAssetSchema,
  favoriteAssetSchema,
  listAssetsSchema,
  naturalLanguageSearchSchema,
} from "../validators/asset.validators.js";
import { aiLimiter, uploadLimiter } from "../middleware/rate-limits.js";
import { actorForProject } from "../authz/actor.js";
import { getPassport, sharePassport, unsharePassport } from "../controllers/passport.controller.js";
import type { RequestHandler } from "express";

/**
 * Clients that put `?projectId=` on the upload URL get their access checked
 * before multer buffers up to 10 x 25 MB into memory. The body field is still
 * checked in the handler, so older clients keep working.
 */
const preauthorizeUpload: RequestHandler = async (req, _res, next) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (projectId) await actorForProject(req.userId!, projectId, "evidence.upload");
  next();
};

export const assetRouter = Router();
assetRouter.get("/", validate(listAssetsSchema), asyncHandler(listAssets));
assetRouter.post("/upload", uploadLimiter, asyncHandler(preauthorizeUpload), uploadMedia, asyncHandler(uploadAssets));
assetRouter.post(
  "/search/interpret",
  aiLimiter,
  validate(naturalLanguageSearchSchema),
  asyncHandler(naturalLanguageSearch),
);
assetRouter.get("/:id", validate(assetIdSchema), asyncHandler(getAsset));
assetRouter.post(
  "/:id/analyze",
  aiLimiter,
  validate(analyzeAssetSchema),
  asyncHandler(analyzeAsset),
);
assetRouter.post(
  "/:id/retry",
  aiLimiter,
  validate(assetIdSchema),
  asyncHandler(retryAssetAnalysis),
);
assetRouter.patch(
  "/:id/favorite",
  validate(favoriteAssetSchema),
  asyncHandler(setFavorite),
);
assetRouter.delete("/:id", validate(assetIdSchema), asyncHandler(deleteAsset));
assetRouter.get("/:id/passport", validate(assetIdSchema), asyncHandler(getPassport));
assetRouter.post("/:id/share", validate(assetIdSchema), asyncHandler(sharePassport));
assetRouter.delete("/:id/share", validate(assetIdSchema), asyncHandler(unsharePassport));
