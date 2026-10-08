import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/app-error.js";
import { aiService } from "../services/ai.service.js";
import { cloudinaryService } from "../services/cloudinary.service.js";
import { auditService } from "../services/audit.service.js";
import {
  actorForProject,
  actorFromRequest,
  assetWhere,
  can,
  projectWhere,
  requirePermission,
} from "../authz/actor.js";
import { ORG_WIDE_ROLES } from "../authz/permissions.js";
import { reevaluateProject } from "../trust/service.js";

const projectInclude = {
  _count: { select: { assets: true, comparisons: true, reports: true } },
  insight: true,
} as const;

/** Loads a project the user may see; scope and permission are checked first. */
async function scopedProject(
  userId: string,
  id: string,
  permission?: Parameters<typeof actorForProject>[2],
) {
  const actor = await actorForProject(userId, id, permission);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id },
    include: projectInclude,
  });
  return { actor, project };
}

export const listProjects: RequestHandler = async (req, res) => {
  const actor = await actorFromRequest(req);
  const projects = await prisma.project.findMany({
    where: projectWhere(actor),
    include: projectInclude,
    orderBy: { updatedAt: "desc" },
  });
  res.json({ projects });
};

export const getProject: RequestHandler = async (req, res) => {
  const { project } = await scopedProject(req.userId!, req.params.id as string);
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
  const { project } = await scopedProject(req.userId!, req.params.id as string, "insight.generate");
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
  const actor = await actorFromRequest(req);
  requirePermission(actor, "project.create");
  const project = await prisma.project.create({
    data: {
      ...req.body,
      coverImage: req.body.coverImage || null,
      ownerId: actor.userId,
      organizationId: actor.organizationId,
      // A program manager only sees assigned projects, so they are assigned to
      // what they create; org-wide roles see it anyway.
      ...(actor.allProjects ? {} : { members: { create: { userId: actor.userId, assignedById: actor.userId } } }),
    },
    include: projectInclude,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "project.created",
    entityType: "Project", entityId: project.id, metadata: { name: project.name },
  });
  res.status(201).json({ project });
};

export const updateProject: RequestHandler = async (req, res) => {
  const id = req.params.id as string;
  const { actor, project: existing } = await scopedProject(req.userId!, id, "project.edit");
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
  // The project period is part of every capture-time check.
  if ("startDate" in req.body || "endDate" in req.body) await reevaluateProject(id);
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "project.updated",
    entityType: "Project", entityId: id, metadata: { fields: Object.keys(req.body) },
  });
  res.json({ project });
};

export const deleteProject: RequestHandler = async (req, res) => {
  const id = req.params.id as string;
  const { actor, project } = await scopedProject(req.userId!, id, "project.delete");
  const assets = await prisma.asset.findMany({
    where: { projectId: id },
    select: { cloudinaryPublicId: true, resourceType: true },
  });
  // Delete database rows first: if this fails nothing is lost. Media cleanup
  // afterwards is best-effort; an orphaned file is safer than a broken record.
  await prisma.project.delete({ where: { id } });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "project.deleted",
    entityType: "Project", entityId: id, metadata: { name: project.name, assets: assets.length },
  });
  await cloudinaryService.deleteResources(assets);
  res.status(204).send();
};

export const dashboardSummary: RequestHandler = async (req, res) => {
  const actor = await actorFromRequest(req);
  const projectScope = projectWhere(actor);
  const assetScope = assetWhere(actor);
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
    prisma.project.count({ where: projectScope }),
    prisma.asset.count({ where: assetScope }),
    prisma.asset.count({
      where: { ...assetScope, aiStatus: "COMPLETED" },
    }),
    prisma.asset.count({
      where: {
        ...assetScope,
        aiStatus: { in: ["NOT_REQUESTED", "PENDING", "PROCESSING"] },
      },
    }),
    prisma.asset.count({ where: { ...assetScope, aiStatus: "FAILED" } }),
    prisma.comparison.count({ where: { project: projectScope } }),
    prisma.report.count({ where: { project: projectScope } }),
    prisma.asset.findMany({
      where: assetScope,
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

/** The project's team: assigned members plus org-wide roles who see it anyway. */
export const listProjectMembers: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId);
  const [assignments, orgWide] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, user: { select: { id: true, name: true, email: true, memberships: { where: { organizationId: actor.organizationId }, select: { role: true } } } } },
    }),
    prisma.membership.findMany({
      where: { organizationId: actor.organizationId, status: "ACTIVE", role: { in: [...ORG_WIDE_ROLES] } },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
    }),
  ]);
  // Email addresses are only shown to people who can already see the member list.
  const showEmail = can(actor, "org.members.view");
  const person = (user: { id: string; name: string; email: string }) =>
    showEmail ? user : { id: user.id, name: user.name };
  res.json({
    assigned: assignments.map(({ user: { memberships, ...user }, createdAt }) => ({
      user: person(user), role: memberships[0]?.role ?? null, assignedAt: createdAt,
    })),
    orgWide: orgWide.map(({ user, role }) => ({ user: person(user), role })),
  });
};

export const addProjectMember: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId, "project.members.manage");
  const userId = req.body.userId as string;
  // Only members of this project's own organization can ever be assigned.
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: actor.organizationId, userId } },
    select: { status: true },
  });
  if (!membership || membership.status !== "ACTIVE")
    throw new AppError(422, "Only active members of this organization can be assigned", undefined, "NOT_A_MEMBER");
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, assignedById: actor.userId },
    update: {},
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "project.member_added",
    entityType: "Project", entityId: projectId, metadata: { userId },
  });
  res.status(201).json({ assigned: true });
};

export const removeProjectMember: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId, "project.members.manage");
  const userId = req.params.userId as string;
  const result = await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  if (!result.count) throw new AppError(404, "This person is not assigned to the project");
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "project.member_removed",
    entityType: "Project", entityId: projectId, metadata: { userId },
  });
  res.status(204).send();
};

export const listSites: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  await actorForProject(req.userId!, projectId);
  const sites = await prisma.site.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  res.json({ sites });
};

/** Sites change what "inside the project area" means, so evidence is re-checked. */
export const createSite: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId, "project.edit");
  const site = await prisma.site.create({ data: { projectId, ...req.body } });
  const rechecked = await reevaluateProject(projectId);
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "site.created",
    entityType: "Site", entityId: site.id, metadata: { name: site.name, projectId },
  });
  res.status(201).json({ site, rechecked });
};

export const deleteSite: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  const actor = await actorForProject(req.userId!, projectId, "project.edit");
  const result = await prisma.site.deleteMany({ where: { id: req.params.siteId as string, projectId } });
  if (!result.count) throw new AppError(404, "Site not found");
  await reevaluateProject(projectId);
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "site.deleted",
    entityType: "Site", entityId: req.params.siteId as string, metadata: { projectId },
  });
  res.status(204).send();
};

/** The project's photo events, newest first, for linking a tally to the day's photos. */
export const listProjectEvents: RequestHandler = async (req, res) => {
  const projectId = req.params.id as string;
  await actorForProject(req.userId!, projectId);
  const events = await prisma.eventCluster.findMany({
    where: { projectId },
    orderBy: { startedAt: "desc" },
    take: 100,
    select: { id: true, startedAt: true, endedAt: true, assetCount: true, representativeIds: true, label: true },
  });
  res.json({ events });
};
