import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { aiService } from "../services/ai.service.js";
import { AppError } from "../utils/app-error.js";
import { actorForProject, actorFromRequest, projectWhere } from "../authz/actor.js";
import { auditService } from "../services/audit.service.js";

const reportInclude = {
  project: { select: { id: true, name: true } },
} as const;

export const listReports: RequestHandler = async (req, res) => {
  const { projectId } = (req.validatedQuery ?? req.query) as { projectId?: string };
  const actor = await actorFromRequest(req);
  const reports = await prisma.report.findMany({
    where: { project: projectWhere(actor), ...(projectId && { projectId }) },
    include: reportInclude,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json({ reports });
};

export const createReport: RequestHandler = async (req, res) => {
  const { projectId, title, reportType } = req.body;
  const actor = await actorForProject(req.userId!, projectId, "report.create");
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { insight: true },
  });
  const [assets, comparisons] = await Promise.all([
    prisma.asset.findMany({
      where: { projectId },
      include: { analysis: true },
      orderBy: [{ capturedAt: "asc" }, { createdAt: "asc" }],
      take: 100,
    }),
    prisma.comparison.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);
  if (!assets.length)
    throw new AppError(422, "Add project evidence before generating a report");
  const evidenceIds = assets.map((asset) => asset.id);
  const result = await aiService.generateImpactReport({
    reportType,
    project: {
      name: project.name,
      description: project.description,
      category: project.category,
      documentedLocation: project.location,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
    },
    savedProjectInsight: project.insight,
    evidence: assets.map((asset) => ({
      id: asset.id,
      mediaType: asset.resourceType,
      date: asset.capturedAt ?? asset.createdAt,
      documentedLocation: asset.locationName,
      documentedActivity: asset.activity,
      visualObservation: asset.analysis?.summary,
      uncertainty: asset.analysis?.uncertainties,
      evidenceStrength: asset.analysis?.evidenceStrength,
    })),
    comparisons: comparisons.map((comparison) => ({
      summary: comparison.summary,
      visibleChangeAnalysis: comparison.changes,
      confidence: comparison.confidence,
    })),
  });
  const report = await prisma.report.create({
    data: {
      projectId,
      title,
      reportType,
      content: {
        ...result,
        evidenceIds,
        comparisonIds: comparisons.map((comparison) => comparison.id),
        generatedAt: new Date().toISOString(),
        model: aiService.model,
        disclaimer:
          "AI-assisted narrative based on stored evidence. Visual observations are descriptive and are not scientific impact measurements.",
      },
    },
    include: reportInclude,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "report.created",
    entityType: "Report", entityId: report.id, metadata: { title, reportType, evidence: evidenceIds.length },
  });
  res.status(201).json({ report });
};

export const getReport: RequestHandler = async (req, res) => {
  const report = await prisma.report.findUnique({
    where: { id: req.params.id as string },
    include: reportInclude,
  });
  if (!report) throw new AppError(404, "Report not found");
  await actorForProject(req.userId!, report.projectId, undefined, "Report not found");
  const content = report.content as { evidenceIds?: string[] };
  const evidence = await prisma.asset.findMany({
    where: {
      id: { in: Array.isArray(content.evidenceIds) ? content.evidenceIds : [] },
      projectId: report.projectId,
    },
    include: { project: { select: { id: true, name: true } }, analysis: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ report: { ...report, evidence } });
};

export const deleteReport: RequestHandler = async (req, res) => {
  const report = await prisma.report.findUnique({ where: { id: req.params.id as string } });
  if (!report) throw new AppError(404, "Report not found");
  const actor = await actorForProject(req.userId!, report.projectId, "report.delete", "Report not found");
  await prisma.report.delete({ where: { id: report.id } });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "report.deleted",
    entityType: "Report", entityId: report.id, metadata: { title: report.title },
  });
  res.status(204).send();
};
