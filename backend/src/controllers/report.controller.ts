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

/** At most this many evidence items go to the model: one per event first, approved first. */
const REPORT_EVIDENCE_LIMIT = 25;

type ReportCandidate = Awaited<ReturnType<typeof reportCandidates>>[number];

function reportCandidates(projectId: string) {
  return prisma.asset.findMany({
    // Rejected evidence never reaches a report.
    where: { projectId, reviewStatus: { not: "REJECTED" } },
    include: { analysis: true, site: { select: { name: true } } },
    orderBy: [{ reviewStatus: "asc" }, { trustScore: { sort: "desc", nulls: "last" } }, { capturedAt: { sort: "desc", nulls: "last" } }],
    take: 400,
  });
}

/**
 * Picks what the model sees: approved before pending, higher trust first, one
 * item per event before any event gets a second, and nothing that carries a
 * hard trust flag unless a reviewer approved it.
 */
function selectEvidence(candidates: ReportCandidate[], hardFlagged: Set<string>) {
  const eligible = candidates.filter((asset) => asset.reviewStatus === "APPROVED" || !hardFlagged.has(asset.id));
  const rank = (asset: ReportCandidate) => (asset.reviewStatus === "APPROVED" ? 0 : 1);
  const ordered = [...eligible].sort((a, b) => rank(a) - rank(b));
  const picked: ReportCandidate[] = [];
  const events = new Set<string>();
  for (const asset of ordered) {
    if (picked.length >= REPORT_EVIDENCE_LIMIT) break;
    const event = asset.eventClusterId ?? asset.id;
    if (!events.has(event)) { events.add(event); picked.push(asset); }
  }
  for (const asset of ordered) {
    if (picked.length >= REPORT_EVIDENCE_LIMIT) break;
    if (!picked.includes(asset)) picked.push(asset);
  }
  return { picked, excludedFlagged: candidates.length - eligible.length };
}

export const createReport: RequestHandler = async (req, res) => {
  const { projectId, title, reportType } = req.body;
  const actor = await actorForProject(req.userId!, projectId, "report.create");
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { insight: true },
  });
  const [candidates, comparisons, totalEvidence] = await Promise.all([
    reportCandidates(projectId),
    prisma.comparison.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.asset.count({ where: { projectId } }),
  ]);
  if (!candidates.length)
    throw new AppError(422, "Add project evidence before generating a report");
  const hard = await prisma.trustCheck.findMany({
    where: { assetId: { in: candidates.map((asset) => asset.id) }, hard: true },
    select: { assetId: true },
  });
  const { picked, excludedFlagged } = selectEvidence(candidates, new Set(hard.map((row) => row.assetId)));
  if (!picked.length)
    throw new AppError(422, "Every piece of evidence in this project needs a second look. Review it before reporting.");

  // Short labels keep the prompt small and make invented IDs detectable.
  const evidenceLabel = new Map(picked.map((asset, index) => [`E${index + 1}`, asset.id]));
  const comparisonLabel = new Map(comparisons.map((comparison, index) => [`C${index + 1}`, comparison.id]));
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
    savedProjectInsight: project.insight
      ? { summary: project.insight.summary, timeSpan: project.insight.timeSpan, evidenceGaps: project.insight.evidenceGaps }
      : null,
    evidence: picked.map((asset, index) => ({
      label: `E${index + 1}`,
      mediaType: asset.resourceType,
      date: asset.capturedAt ?? asset.createdAt,
      site: asset.site?.name ?? null,
      documentedLocation: asset.locationName,
      activity: asset.activity ?? asset.analysis?.activity,
      visualObservation: asset.analysis?.summary,
      trust: asset.trustStatus,
      reviewed: asset.reviewStatus === "APPROVED",
    })),
    comparisons: comparisons.map((comparison, index) => ({
      label: `C${index + 1}`,
      summary: comparison.summary,
      confidence: comparison.confidence,
    })),
  });

  // Keep only labels we actually supplied; anything else was invented.
  let unsupported = 0;
  let supported = 0;
  const cite = (claims: Array<{ text: string; evidence: string[] }>) =>
    claims.map((claim) => {
      const evidenceIds = claim.evidence.map((label) => evidenceLabel.get(label.toUpperCase())).filter((id): id is string => Boolean(id));
      const comparisonIds = claim.evidence.map((label) => comparisonLabel.get(label.toUpperCase())).filter((id): id is string => Boolean(id));
      if (evidenceIds.length || comparisonIds.length) supported += 1;
      else unsupported += 1;
      return { text: claim.text, evidenceIds: [...new Set(evidenceIds)], comparisonIds: [...new Set(comparisonIds)] };
    });
  const content = {
    executiveSummary: result.executiveSummary,
    documentedActivities: cite(result.documentedActivities),
    visibleObservations: cite(result.visibleObservations),
    comparisonFindings: cite(result.comparisonFindings),
    evidenceGaps: result.evidenceGaps,
    methodologyNote: result.methodologyNote,
    evidenceIds: picked.map((asset) => asset.id),
    comparisonIds: comparisons.map((comparison) => comparison.id),
    citations: { supported, unsupported },
    selection: {
      totalEvidence,
      considered: picked.length,
      approved: picked.filter((asset) => asset.reviewStatus === "APPROVED").length,
      excludedRejected: totalEvidence - candidates.length,
      excludedNeedsSecondLook: excludedFlagged,
    },
    generatedAt: new Date().toISOString(),
    model: aiService.model,
    disclaimer:
      "AI-assisted narrative based on stored evidence. Visual observations are descriptive and are not scientific impact measurements.",
  };
  const report = await prisma.report.create({
    data: { projectId, title, reportType, content },
    include: reportInclude,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "report.created",
    entityType: "Report", entityId: report.id, metadata: { title, reportType, evidence: picked.length, unsupported },
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
