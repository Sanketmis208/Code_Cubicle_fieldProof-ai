import { ReportType } from "@prisma/client";
import { z } from "zod";

export const listByProjectSchema = z.object({
  query: z.object({ projectId: z.string().cuid().optional() }),
});

export const createComparisonSchema = z.object({
  body: z
    .object({
      projectId: z.string().cuid(),
      beforeAssetId: z.string().cuid(),
      afterAssetId: z.string().cuid(),
    })
    .refine((data) => data.beforeAssetId !== data.afterAssetId, {
      message: "Select two different evidence assets",
      path: ["afterAssetId"],
    }),
});

export const createReportSchema = z.object({
  body: z.object({
    projectId: z.string().cuid(),
    title: z.string().trim().min(3).max(160),
    reportType: z.nativeEnum(ReportType),
  }),
});

export const recordIdSchema = z.object({
  params: z.object({ id: z.string().cuid() }),
});
