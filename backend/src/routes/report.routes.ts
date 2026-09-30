import { Router } from "express";
import { createReport, deleteReport, getReport, listReports } from "../controllers/report.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createReportSchema, listByProjectSchema, recordIdSchema } from "../validators/intelligence.validators.js";
import { aiLimiter } from "../middleware/rate-limits.js";

export const reportRouter = Router();
reportRouter.get("/", validate(listByProjectSchema), asyncHandler(listReports));
reportRouter.post("/", aiLimiter, validate(createReportSchema), asyncHandler(createReport));
reportRouter.get("/:id", validate(recordIdSchema), asyncHandler(getReport));
reportRouter.delete("/:id", validate(recordIdSchema), asyncHandler(deleteReport));
