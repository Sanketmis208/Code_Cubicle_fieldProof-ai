import type { Prisma } from "@prisma/client";
import type { RequestHandler } from "express";
import { actorForProject } from "../authz/actor.js";
import { prisma } from "../lib/prisma.js";
import { auditService } from "../services/audit.service.js";
import { AppError } from "../utils/app-error.js";

/**
 * Targets and tallies answer the question photos cannot: "how many?". A
 * project commits to a countable outcome (500 saplings); field staff record
 * each batch with its site and the event (photos) that documents it; a
 * reviewer confirms the count. Reports and the claim checker then say how much
 * of a number is backed by confirmed tallies with evidence behind them.
 */
const tallyInclude = {
  site: { select: { id: true, name: true } },
  eventCluster: { select: { id: true, assetCount: true, representativeIds: true, startedAt: true } },
} as const;

async function targetWithProgress(targetId: string) {
  const target = await prisma.target.findUniqueOrThrow({
    where: { id: targetId },
    include: { tallies: { include: tallyInclude, orderBy: { recordedAt: "desc" } } },
  });
  return withProgress(target);
}

type TargetRow = Prisma.TargetGetPayload<{ include: { tallies: { include: typeof tallyInclude } } }>;

function withProgress(target: TargetRow) {
  const confirmed = target.tallies.filter((t) => t.reviewStatus === "APPROVED").reduce((sum, t) => sum + t.count, 0);
  const recorded = target.tallies.filter((t) => t.reviewStatus !== "REJECTED").reduce((sum, t) => sum + t.count, 0);
  const withEvidence = target.tallies.filter((t) => t.reviewStatus !== "REJECTED" && t.eventClusterId).reduce((sum, t) => sum + t.count, 0);
  return {
    ...target,
    progress: {
      recorded, confirmed, withEvidence,
      recordedPercent: Math.min(100, Math.round((recorded / target.targetCount) * 100)),
      confirmedPercent: Math.min(100, Math.round((confirmed / target.targetCount) * 100)),
      batches: target.tallies.length,
    },
  };
}

export const listTargets: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  await actorForProject(req.userId!, projectId);
  const targets = await prisma.target.findMany({
    where: { projectId },
    include: { tallies: { include: tallyInclude, orderBy: { recordedAt: "desc" } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({ targets: targets.map(withProgress) });
};

export const createTarget: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId, "project.edit");
  const target = await prisma.target.create({ data: { projectId, ...req.body } });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "target.created",
    entityType: "Target", entityId: target.id, metadata: { label: target.label, targetCount: target.targetCount, projectId },
  });
  res.status(201).json({ target: await targetWithProgress(target.id) });
};

export const deleteTarget: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId, "project.edit");
  const result = await prisma.target.deleteMany({ where: { id: req.params.targetId as string, projectId } });
  if (!result.count) throw new AppError(404, "Target not found");
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "target.deleted",
    entityType: "Target", entityId: req.params.targetId as string, metadata: { projectId },
  });
  res.status(204).send();
};

/** Field staff record a batch; uploading evidence and recording a count go together. */
export const addTally: RequestHandler = async (req, res) => {
  const target = await prisma.target.findUnique({ where: { id: req.params.targetId as string }, select: { id: true, projectId: true, label: true } });
  if (!target) throw new AppError(404, "Target not found");
  const actor = await actorForProject(req.userId!, target.projectId, "evidence.upload", "Target not found");
  const { count, recordedAt, siteId, eventClusterId, note } = req.body as {
    count: number; recordedAt?: string; siteId?: string; eventClusterId?: string; note?: string;
  };
  if (siteId && !(await prisma.site.findFirst({ where: { id: siteId, projectId: target.projectId }, select: { id: true } })))
    throw new AppError(422, "That site belongs to another project");
  if (eventClusterId && !(await prisma.eventCluster.findFirst({ where: { id: eventClusterId, projectId: target.projectId }, select: { id: true } })))
    throw new AppError(422, "That event belongs to another project");
  const tally = await prisma.tally.create({
    data: {
      targetId: target.id, count, recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      siteId: siteId ?? null, eventClusterId: eventClusterId ?? null, note: note?.trim() || null, recordedById: actor.userId,
    },
    include: tallyInclude,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "tally.recorded",
    entityType: "Tally", entityId: tally.id, metadata: { count, target: target.label, projectId: target.projectId },
  });
  res.status(201).json({ tally, target: await targetWithProgress(target.id) });
};

/** Reviewers confirm counts the same way they approve photos; nobody confirms their own tally. */
export const reviewTally: RequestHandler = async (req, res) => {
  const tally = await prisma.tally.findUnique({ where: { id: req.params.tallyId as string }, include: { target: { select: { projectId: true, label: true } } } });
  if (!tally) throw new AppError(404, "Tally not found");
  const actor = await actorForProject(req.userId!, tally.target.projectId, "evidence.review", "Tally not found");
  const decision = req.body.decision as "APPROVED" | "REJECTED";
  if (tally.recordedById === actor.userId) {
    const reviewers = await prisma.membership.count({ where: { organizationId: actor.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "PROGRAM_MANAGER", "VERIFIER"] } } });
    if (reviewers > 1) throw new AppError(403, "You cannot confirm a count you recorded yourself", undefined, "SELF_REVIEW");
  }
  const updated = await prisma.tally.update({
    where: { id: tally.id },
    data: { reviewStatus: decision, reviewedById: actor.userId, reviewedAt: new Date() },
    include: tallyInclude,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "tally.reviewed",
    entityType: "Tally", entityId: tally.id, metadata: { decision, count: tally.count, target: tally.target.label },
  });
  res.json({ tally: updated, target: await targetWithProgress(tally.targetId) });
};
