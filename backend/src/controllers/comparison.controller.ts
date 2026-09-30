import type { RequestHandler } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { aiService } from "../services/ai.service.js";
import { cloudinaryService } from "../services/cloudinary.service.js";
import { AppError } from "../utils/app-error.js";
import { reportReferencesComparison } from "../utils/report-references.js";

const assetSelect = {
  id: true,
  projectId: true,
  originalFilename: true,
  resourceType: true,
  secureUrl: true,
  cloudinaryPublicId: true,
  capturedAt: true,
  createdAt: true,
  locationName: true,
  activity: true,
  description: true,
  analysis: true,
} as const;

const comparisonInclude = {
  project: { select: { id: true, name: true } },
  beforeAsset: { select: assetSelect },
  afterAsset: { select: assetSelect },
} as const;

async function ownedProject(id: string, ownerId: string) {
  const project = await prisma.project.findFirst({ where: { id, ownerId } });
  if (!project) throw new AppError(404, "Project not found");
  return project;
}

function representativeUrl(asset: {
  resourceType: string;
  secureUrl: string;
  cloudinaryPublicId: string;
  analysis: { representativeFrames: Prisma.JsonValue | null } | null;
}) {
  if (asset.resourceType !== "VIDEO") return asset.secureUrl;
  const frames = asset.analysis?.representativeFrames;
  if (Array.isArray(frames) && typeof frames[1] === "string") return frames[1];
  return cloudinaryService.videoFrameUrls(asset.cloudinaryPublicId)[1] ?? asset.secureUrl;
}

export const listComparisons: RequestHandler = async (req, res) => {
  const { projectId } = (req.validatedQuery ?? req.query) as { projectId?: string };
  const comparisons = await prisma.comparison.findMany({
    where: { project: { ownerId: req.userId }, ...(projectId && { projectId }) },
    include: comparisonInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ comparisons });
};

export const createComparison: RequestHandler = async (req, res) => {
  const { projectId, beforeAssetId, afterAssetId } = req.body;
  const project = await ownedProject(projectId, req.userId!);
  const assets = await prisma.asset.findMany({
    where: { id: { in: [beforeAssetId, afterAssetId] }, projectId },
    select: assetSelect,
  });
  if (assets.length !== 2)
    throw new AppError(422, "Both evidence assets must belong to this project");
  const before = assets.find((asset) => asset.id === beforeAssetId)!;
  const after = assets.find((asset) => asset.id === afterAssetId)!;
  if (before.resourceType === "RAW" || after.resourceType === "RAW")
    throw new AppError(422, "Comparisons support image and video evidence");
  const beforeDate = before.capturedAt ?? before.createdAt;
  const afterDate = after.capturedAt ?? after.createdAt;
  if (beforeDate > afterDate)
    throw new AppError(422, "The before evidence must be earlier than the after evidence");
  const duplicate = await prisma.comparison.findUnique({
    where: { beforeAssetId_afterAssetId: { beforeAssetId, afterAssetId } },
    include: comparisonInclude,
  });
  if (duplicate) return res.json({ comparison: duplicate, cached: true });
  const result = await aiService.compareEvidence(
    representativeUrl(before),
    representativeUrl(after),
    {
      project: { name: project.name, category: project.category, location: project.location },
      before: {
        date: beforeDate,
        activity: before.activity,
        location: before.locationName,
        persistedAnalysis: before.analysis?.summary,
      },
      after: {
        date: afterDate,
        activity: after.activity,
        location: after.locationName,
        persistedAnalysis: after.analysis?.summary,
      },
    },
  );
  const comparison = await prisma.comparison.create({
    data: {
      projectId,
      beforeAssetId,
      afterAssetId,
      summary: result.summary,
      changes: {
        visibleChanges: result.visibleChanges,
        stableObservations: result.stableObservations,
        uncertainties: result.uncertainties,
        evidenceLimitations: result.evidenceLimitations,
        model: aiService.model,
      },
      confidence: result.confidence,
    },
    include: comparisonInclude,
  });
  res.status(201).json({ comparison, cached: false });
};

export const deleteComparison: RequestHandler = async (req, res) => {
  const comparison = await prisma.comparison.findFirst({
    where: { id: req.params.id as string, project: { ownerId: req.userId } },
  });
  if (!comparison) throw new AppError(404, "Comparison not found");
  const reports = await prisma.report.findMany({
    where: { projectId: comparison.projectId },
    select: { content: true },
  });
  if (
    reports.some((report) =>
      reportReferencesComparison(report.content, comparison.id),
    )
  )
    throw new AppError(
      409,
      "Delete or regenerate reports that reference this comparison before deleting it",
    );
  await prisma.comparison.delete({ where: { id: comparison.id } });
  res.status(204).send();
};
