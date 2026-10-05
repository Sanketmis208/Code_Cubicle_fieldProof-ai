import type { Prisma, ReviewStatus } from "@prisma/client";
import type { RequestHandler } from "express";
import { actorForProject, actorFromRequest, assetWhere, requirePermission, type Actor } from "../authz/actor.js";
import { ROLE_PERMISSIONS } from "../authz/permissions.js";
import { prisma } from "../lib/prisma.js";
import { auditService } from "../services/audit.service.js";
import { evidenceInclude } from "../services/evidence.service.js";
import { AppError } from "../utils/app-error.js";

type Decision = Exclude<ReviewStatus, "PENDING">;

/** Roles that can review, derived from the permission table (not hard-coded). */
const REVIEW_ROLES = (Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>).filter((role) =>
  ROLE_PERMISSIONS[role].includes("evidence.review"),
);

/**
 * Separation of duties: nobody approves their own upload. The one exception is
 * an organization with a single person able to review (a solo workspace), where
 * the review is allowed but recorded as self-reviewed.
 */
async function selfReviewAllowed(actor: Actor) {
  const reviewers = await prisma.membership.count({
    where: { organizationId: actor.organizationId, status: "ACTIVE", role: { in: REVIEW_ROLES } },
  });
  return reviewers <= 1;
}

export const reviewQueue: RequestHandler = async (req, res) => {
  const actor = await actorFromRequest(req);
  requirePermission(actor, "evidence.review");
  const { projectId, status } = (req.validatedQuery ?? {}) as { projectId?: string; status?: ReviewStatus };
  const where: Prisma.AssetWhereInput = {
    ...assetWhere(actor),
    ...(projectId && { projectId }),
    reviewStatus: status ?? "PENDING",
  };
  const [assets, counts] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: { ...evidenceInclude, uploadedBy: { select: { id: true, name: true } } },
      // Riskiest first: needs-a-second-look, then lowest score, then oldest.
      orderBy: [{ trustStatus: "desc" }, { trustScore: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: 200,
    }),
    prisma.asset.groupBy({ by: ["reviewStatus"], where: { ...assetWhere(actor), ...(projectId && { projectId }) }, _count: true }),
  ]);
  const checks = await prisma.trustCheck.findMany({
    where: { assetId: { in: assets.map((asset) => asset.id) }, result: { in: ["WARN", "FAIL"] } },
    orderBy: [{ hard: "desc" }, { weight: "asc" }],
  });
  const byAsset = new Map<string, typeof checks>();
  checks.forEach((check) => byAsset.set(check.assetId, [...(byAsset.get(check.assetId) ?? []), check]));
  res.json({
    assets: assets.map((asset) => ({
      ...asset,
      flags: byAsset.get(asset.id) ?? [],
      ownUpload: asset.uploadedById === actor.userId,
    })),
    counts: Object.fromEntries(counts.map((row) => [row.reviewStatus, row._count])),
    selfReviewAllowed: await selfReviewAllowed(actor),
  });
};

async function applyDecision(actor: Actor, assetId: string, decision: Decision, note: string | null, soloReviewer: boolean) {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { id: true, uploadedById: true, originalFilename: true, projectId: true } });
  const own = asset.uploadedById === actor.userId;
  if (own && !soloReviewer)
    throw new AppError(403, "You cannot review evidence you uploaded. Another reviewer must decide.", undefined, "SELF_REVIEW");
  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: { reviewStatus: decision, reviewedById: actor.userId, reviewedAt: new Date(), reviewNote: note },
    include: evidenceInclude,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "evidence.reviewed",
    entityType: "Asset", entityId: asset.id,
    metadata: { decision, note, filename: asset.originalFilename, ...(own ? { selfReviewed: true } : {}) },
  });
  return updated;
}

function validateNote(decision: Decision, note: unknown) {
  const text = typeof note === "string" ? note.trim() : "";
  if (decision !== "APPROVED" && text.length < 3)
    throw new AppError(422, "Say why, so the field worker knows what to fix", undefined, "REASON_REQUIRED");
  return text || null;
}

export const reviewAsset: RequestHandler = async (req, res) => {
  const assetId = req.params.id as string;
  const target = await prisma.asset.findUnique({ where: { id: assetId }, select: { projectId: true } });
  if (!target) throw new AppError(404, "Evidence asset not found");
  const actor = await actorForProject(req.userId!, target.projectId, "evidence.review", "Evidence asset not found");
  const decision = req.body.decision as Decision;
  const asset = await applyDecision(actor, assetId, decision, validateNote(decision, req.body.note), await selfReviewAllowed(actor));
  res.json({ asset });
};

/**
 * "Approve the whole event": one click clears a burst. Items with a hard flag,
 * and the reviewer's own uploads, are left for individual decisions.
 */
export const reviewCluster: RequestHandler = async (req, res) => {
  const cluster = await prisma.eventCluster.findUnique({ where: { id: req.params.id as string }, select: { id: true, projectId: true } });
  if (!cluster) throw new AppError(404, "Event not found");
  const actor = await actorForProject(req.userId!, cluster.projectId, "evidence.review", "Event not found");
  const decision = req.body.decision as Decision;
  const note = validateNote(decision, req.body.note);
  const solo = await selfReviewAllowed(actor);
  const members = await prisma.asset.findMany({
    where: { eventClusterId: cluster.id, reviewStatus: "PENDING" },
    select: { id: true, uploadedById: true, trustChecks: { where: { hard: true }, select: { id: true } } },
  });
  const reviewed: string[] = [];
  const left: Array<{ id: string; reason: "HARD_FLAG" | "OWN_UPLOAD" }> = [];
  for (const member of members) {
    if (decision === "APPROVED" && member.trustChecks.length) left.push({ id: member.id, reason: "HARD_FLAG" });
    else if (member.uploadedById === actor.userId && !solo) left.push({ id: member.id, reason: "OWN_UPLOAD" });
    else {
      await applyDecision(actor, member.id, decision, note, solo);
      reviewed.push(member.id);
    }
  }
  res.json({ reviewed: reviewed.length, left });
};
