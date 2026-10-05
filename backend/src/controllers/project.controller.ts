import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/app-error.js";
import { aiService } from "../services/ai.service.js";
import { cloudinaryService } from "../services/cloudinary.service.js";

const projectInclude = {
  _count: { select: { assets: true, comparisons: true, reports: true } },
  insight: true,
} as const;

async function ownedProject(id: string, ownerId: string) {
  const project = await prisma.project.findFirst({
    where: { id, ownerId },
    include: projectInclude,
  });
  if (!project) throw new AppError(404, "Project not found");
  return project;
}

export const listProjects: RequestHandler = async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { ownerId: req.userId },
    include: projectInclude,
    orderBy: { updatedAt: "desc" },
  });
  res.json({ projects });
};

export const getProject: RequestHandler = async (req, res) => {
  const project = await ownedProject(req.params.id as string, req.userId!);
  const [recentAssets, statusGroups, typeGroups] = await Promise.all([
    prisma.asset.findMany({
      where: { projectId: project.id },
      include: {
        project: { select: { id: true, name: true } },
        analysis: true,
      },
      orderBy: [{ capturedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 250,
    }),
    prisma.asset.groupBy({
      by: ["aiStatus"],
      where: { projectId: project.id },
      _count: true,
    }),
    prisma.asset.groupBy({
      by: ["resourceType"],
      where: { projectId: project.id },
      _count: true,
    }),
  ]);
  const dateSet = new Set(
    recentAssets.map((asset) =>
      (asset.capturedAt ?? asset.createdAt).toISOString().slice(0, 10),
    ),
  );
  const locations = new Set(
    recentAssets
      .map((asset) => asset.locationName)
      .filter((value): value is string => Boolean(value)),
  );
  if (project.location) locations.add(project.location);
  const activities = new Set(
    recentAssets
      .map((asset) => asset.activity ?? asset.analysis?.activity)
      .filter((value): value is string => Boolean(value)),
  );
  const candidateGroups = new Map<string, Set<string>>();
  recentAssets.forEach((asset) => {
    const activity = asset.activity ?? asset.analysis?.activity;
    if (!activity) return;
    const key = `${activity.toLowerCase()}|${(asset.locationName ?? "unknown").toLowerCase()}`;
    const dates = candidateGroups.get(key) ?? new Set<string>();
    dates.add((asset.capturedAt ?? asset.createdAt).toISOString().slice(0, 10));
    candidateGroups.set(key, dates);
  });
  const qualityFlags = recentAssets.filter((asset) => {
    const quality = asset.analysis?.visualQuality?.toLowerCase() ?? "";
    return (
      asset.analysis?.evidenceStrength === "limited" ||
      ["blur", "dark", "poor", "obstruct", "low resolution"].some((term) =>
        quality.includes(term),
      )
    );
  }).length;
  const analyzed =
    statusGroups.find((group) => group.aiStatus === "COMPLETED")?._count ?? 0;
  res.json({
    project: {
      ...project,
      recentAssets,
      workspaceMetrics: {
        statusGroups,
        typeGroups,
        coverage: {
          totalMedia: project._count.assets,
          analyzedPercent: project._count.assets
            ? Math.round((analyzed / project._count.assets) * 100)
            : 0,
          locationsRepresented: locations.size,
          datesRepresented: dateSet.size,
          activityCategories: [...activities].sort(),
          beforeAfterCandidates: [...candidateGroups.values()].filter(
            (dates) => dates.size >= 2,
          ).length,
          qualityFlags,
        },
      },
    },
  });
};

export const generateProjectInsight: RequestHandler = async (req, res) => {
  const project = await ownedProject(req.params.id as string, req.userId!);
  const assets = await prisma.asset.findMany({
    where: { projectId: project.id },
    include: { analysis: true },
    orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
    take: 250,
  });
  if (!assets.length)
    throw new AppError(422, "Add evidence before generating a project summary");
  const snapshot = {
    project: {
      name: project.name,
      description: project.description,
      category: project.category,
      location: project.location,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
    },
    evidence: assets.map((asset) => ({
      mediaType: asset.resourceType,
      capturedOrUploadedAt: asset.capturedAt ?? asset.createdAt,
      documentedLocation: asset.locationName,
      documentedActivity: asset.activity,
      visualAnalysis: asset.analysis
        ? {
            summary: asset.analysis.summary,
            activity: asset.analysis.activity,
            locationType: asset.analysis.locationType,
            environmentalSignals: asset.analysis.environmentalSignals,
            infrastructureSignals: asset.analysis.infrastructureSignals,
            uncertainties: asset.analysis.uncertainties,
            confidence: asset.analysis.confidence,
          }
        : null,
    })),
  };
  const result = await aiService.summarizeProject(snapshot);
  const insight = await prisma.projectInsight.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      ...result,
      sourceEvidenceCount: assets.length,
      model: aiService.model,
    },
    update: {
      ...result,
      sourceEvidenceCount: assets.length,
      model: aiService.model,
    },
  });
  res.json({ insight });
};

export const createProject: RequestHandler = async (req, res) => {
  const project = await prisma.project.create({
    data: {
      ...req.body,
      coverImage: req.body.coverImage || null,
      ownerId: req.userId!,
    },
    include: projectInclude,
  });
  res.status(201).json({ project });
};

export const updateProject: RequestHandler = async (req, res) => {
  const id = req.params.id as string;
  const existing = await ownedProject(id, req.userId!);
  const startDate = req.body.startDate ?? existing.startDate;
  const endDate =
    req.body.endDate === undefined ? existing.endDate : req.body.endDate;
  if (endDate && endDate < startDate)
    throw new AppError(422, "End date cannot be before start date");
  const project = await prisma.project.update({
    where: { id },
    data: req.body,
    include: projectInclude,
  });
  res.json({ project });
};

export const deleteProject: RequestHandler = async (req, res) => {
  const id = req.params.id as string;
  await ownedProject(id, req.userId!);
  const assets = await prisma.asset.findMany({
    where: { projectId: id },
    select: { cloudinaryPublicId: true, resourceType: true },
  });
  // Delete database rows first: if this fails nothing is lost. Media cleanup
  // afterwards is best-effort; an orphaned file is safer than a broken record.
  await prisma.project.delete({ where: { id } });
  await cloudinaryService.deleteResources(assets);
  res.status(204).send();
};

export const dashboardSummary: RequestHandler = async (req, res) => {
  const ownerId = req.userId!;
  const [
    projects,
    assets,
    analyzed,
    pending,
    failed,
    comparisons,
    reports,
    recentAssets,
  ] = await Promise.all([
    prisma.project.count({ where: { ownerId } }),
    prisma.asset.count({ where: { project: { ownerId } } }),
    prisma.asset.count({
      where: { project: { ownerId }, aiStatus: "COMPLETED" },
    }),
    prisma.asset.count({
      where: {
        project: { ownerId },
        aiStatus: { in: ["NOT_REQUESTED", "PENDING", "PROCESSING"] },
      },
    }),
    prisma.asset.count({ where: { project: { ownerId }, aiStatus: "FAILED" } }),
    prisma.comparison.count({ where: { project: { ownerId } } }),
    prisma.report.count({ where: { project: { ownerId } } }),
    prisma.asset.findMany({
      where: { project: { ownerId } },
      select: {
        id: true,
        originalFilename: true,
        secureUrl: true,
        resourceType: true,
        aiStatus: true,
        activity: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);
  res.json({
    projects,
    assets,
    analyzed,
    pending,
    failed,
    comparisons,
    reports,
    recentAssets,
  });
};
