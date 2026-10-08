import type { RequestHandler } from "express";
import { actorFromRequest, assetWhere, projectWhere } from "../authz/actor.js";
import { ROLE_LABEL } from "../authz/permissions.js";
import { prisma } from "../lib/prisma.js";
import { aiService } from "../services/ai.service.js";

/**
 * The in-app assistant answers questions about *this organization's* evidence
 * from a snapshot of real numbers: projects, trust and review counts, targets
 * and recent flags. It never sees other organizations and never invents
 * figures: the numbers are computed here and handed to the model as facts.
 */
async function snapshot(actor: Awaited<ReturnType<typeof actorFromRequest>>) {
  const pw = projectWhere(actor);
  const aw = assetWhere(actor);
  const [projects, byTrust, byReview, pending, targets, flagged, organization] = await Promise.all([
    prisma.project.findMany({ where: pw, select: { id: true, name: true, status: true, location: true, category: true, _count: { select: { assets: true, reports: true, comparisons: true } } }, orderBy: { updatedAt: "desc" }, take: 25 }),
    prisma.asset.groupBy({ by: ["trustStatus"], where: aw, _count: true }),
    prisma.asset.groupBy({ by: ["reviewStatus"], where: aw, _count: true }),
    prisma.asset.count({ where: { ...aw, reviewStatus: "PENDING" } }),
    prisma.target.findMany({ where: { project: pw }, include: { project: { select: { name: true } }, tallies: { select: { count: true, reviewStatus: true } } }, take: 30 }),
    prisma.trustCheck.findMany({
      where: { asset: aw, result: { in: ["WARN", "FAIL"] } }, orderBy: { createdAt: "desc" }, take: 12,
      select: { check: true, message: true, asset: { select: { originalFilename: true, project: { select: { name: true } } } } },
    }),
    prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { name: true, type: true } }),
  ]);
  return {
    organization: organization?.name, type: organization?.type, yourRole: ROLE_LABEL[actor.role],
    projects: projects.map((p) => ({ name: p.name, status: p.status, location: p.location, category: p.category, evidence: p._count.assets, reports: p._count.reports, comparisons: p._count.comparisons })),
    evidenceByTrust: Object.fromEntries(byTrust.map((row) => [row.trustStatus, row._count])),
    evidenceByReview: Object.fromEntries(byReview.map((row) => [row.reviewStatus, row._count])),
    awaitingReview: pending,
    targets: targets.map((t) => ({
      project: t.project.name, label: t.label, unit: t.unit, target: t.targetCount,
      recorded: t.tallies.filter((x) => x.reviewStatus !== "REJECTED").reduce((s, x) => s + x.count, 0),
      confirmed: t.tallies.filter((x) => x.reviewStatus === "APPROVED").reduce((s, x) => s + x.count, 0),
    })),
    recentFlags: flagged.map((f) => ({ project: f.asset.project.name, file: f.asset.originalFilename, check: f.check, why: f.message })),
  };
}

export const chat: RequestHandler = async (req, res) => {
  const actor = await actorFromRequest(req);
  const { messages } = req.body as { messages: Array<{ role: "user" | "assistant"; content: string }> };
  const facts = await snapshot(actor);
  const reply = await aiService.assist(messages, facts);
  res.json({ reply });
};
