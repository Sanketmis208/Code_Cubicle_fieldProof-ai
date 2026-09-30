import { Router } from "express";
import { createComparison, deleteComparison, listComparisons } from "../controllers/comparison.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createComparisonSchema, listByProjectSchema, recordIdSchema } from "../validators/intelligence.validators.js";
import { aiLimiter } from "../middleware/rate-limits.js";

export const comparisonRouter = Router();
comparisonRouter.get("/", validate(listByProjectSchema), asyncHandler(listComparisons));
comparisonRouter.post("/", aiLimiter, validate(createComparisonSchema), asyncHandler(createComparison));
comparisonRouter.delete("/:id", validate(recordIdSchema), asyncHandler(deleteComparison));
