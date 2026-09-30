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

export const assetRouter = Router();
assetRouter.get("/", validate(listAssetsSchema), asyncHandler(listAssets));
assetRouter.post("/upload", uploadLimiter, uploadMedia, asyncHandler(uploadAssets));
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
