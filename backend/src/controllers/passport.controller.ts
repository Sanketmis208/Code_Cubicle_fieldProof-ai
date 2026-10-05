import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import { actorForProject } from "../authz/actor.js";
import { prisma } from "../lib/prisma.js";
import { auditService } from "../services/audit.service.js";
import { cloudinaryService } from "../services/cloudinary.service.js";
import { AppError } from "../utils/app-error.js";

/**
 * The Evidence Passport: everything needed to judge one piece of evidence —
 * its fingerprint, capture facts, every trust check, the human decision, and
 * every file derived from it with the exact Cloudinary transformation used.
 */
async function loadPassport(assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      project: { select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } } },
      analysis: { select: { summary: true, activity: true, confidence: true, model: true, authenticity: true } },
      site: { select: { id: true, name: true } },
      eventCluster: { select: { id: true, assetCount: true, startedAt: true, endedAt: true } },
      uploadedBy: { select: { id: true, name: true } },
      trustChecks: { orderBy: [{ hard: "desc" }, { weight: "asc" }] },
    },
  });
  if (!asset) return null;
  const [reviewer, derived, related] = await Promise.all([
    asset.reviewedById ? prisma.user.findUnique({ where: { id: asset.reviewedById }, select: { name: true } }) : null,
    prisma.derivedAsset.findMany({
      where: { organizationId: asset.project.organizationId, sourceAssetIds: { array_contains: [asset.id] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // The originals behind reuse flags, shown side by side.
    prisma.asset.findMany({
      where: {
        id: { in: asset.trustChecks.map((check) => check.relatedAssetId).filter((id): id is string => Boolean(id)) },
        project: { organizationId: asset.project.organizationId },
      },
      select: { id: true, secureUrl: true, resourceType: true, cloudinaryPublicId: true, originalFilename: true, createdAt: true, capturedAt: true, project: { select: { name: true } } },
    }),
  ]);
  const kind = asset.resourceType === "VIDEO" ? "video" : "image";
  const delivery = asset.resourceType === "RAW" ? [] : [
    { purpose: "Thumbnail in the app", transformation: "c_fill,g_auto,w_800,h_600,q_auto,f_auto" + (kind === "video" ? ",so_0" : "") },
    { purpose: "Sent to the vision model", transformation: "c_limit,w_1280,h_1280,q_auto,f_jpg" + (kind === "video" ? ",so_50p" : "") },
    { purpose: "Public, faces blurred", transformation: "e_blur_faces:800,c_limit,w_1600,q_auto,f_auto" + (kind === "video" ? ",so_0" : "") },
    { purpose: "Data-saver for field phones", transformation: "c_limit,w_720,q_auto:low,f_auto" + (kind === "video" ? ",so_0" : "") },
  ].map((entry) => ({ ...entry, url: cloudinaryService.deliveryUrl(asset.cloudinaryPublicId, kind, entry.transformation) }));
  return { asset, reviewer, derived, related, delivery };
}

export const getPassport: RequestHandler = async (req, res) => {
  const passport = await loadPassport(req.params.id as string);
  if (!passport) throw new AppError(404, "Evidence asset not found");
  await actorForProject(req.userId!, passport.asset.projectId, undefined, "Evidence asset not found");
  const { asset, reviewer, derived, related, delivery } = passport;
  res.json({
    passport: {
      asset,
      reviewer: reviewer?.name ?? null,
      derived,
      related,
      delivery,
      publicPath: asset.publicToken ? `/passport/${asset.publicToken}` : null,
    },
  });
};

/** Publishing a passport is a curation decision, so it needs the curate permission. */
export const sharePassport: RequestHandler = async (req, res) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id as string }, select: { id: true, projectId: true, publicToken: true } });
  if (!asset) throw new AppError(404, "Evidence asset not found");
  const actor = await actorForProject(req.userId!, asset.projectId, "evidence.curate", "Evidence asset not found");
  const token = asset.publicToken ?? randomBytes(18).toString("base64url");
  if (!asset.publicToken) {
    await prisma.asset.update({ where: { id: asset.id }, data: { publicToken: token } });
    await auditService.record({ organizationId: actor.organizationId, actorId: actor.userId, action: "passport.shared", entityType: "Asset", entityId: asset.id });
  }
  res.json({ publicPath: `/passport/${token}`, token });
};

export const unsharePassport: RequestHandler = async (req, res) => {
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id as string }, select: { id: true, projectId: true } });
  if (!asset) throw new AppError(404, "Evidence asset not found");
  const actor = await actorForProject(req.userId!, asset.projectId, "evidence.curate", "Evidence asset not found");
  await prisma.asset.update({ where: { id: asset.id }, data: { publicToken: null } });
  await auditService.record({ organizationId: actor.organizationId, actorId: actor.userId, action: "passport.unshared", entityType: "Asset", entityId: asset.id });
  res.status(204).send();
};

const round = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);

/**
 * Public view for anyone holding the link (e.g. by scanning a campaign card's
 * QR). It proves the evidence without exposing people: faces are blurred,
 * coordinates are rounded to about 1 km, and no names or emails are shown.
 */
export const publicPassport: RequestHandler = async (req, res) => {
  const token = String(req.params.token ?? "");
  const match = /^[A-Za-z0-9_-]{16,64}$/.test(token)
    ? await prisma.asset.findUnique({ where: { publicToken: token }, select: { id: true } })
    : null;
  const passport = match ? await loadPassport(match.id) : null;
  if (!passport) throw new AppError(404, "This evidence link is not valid or was withdrawn");
  const { asset, derived, delivery } = passport;
  const kind = asset.resourceType === "VIDEO" ? "video" : "image";
  res.json({
    passport: {
      organization: asset.project.organization.name,
      project: asset.project.name,
      resourceType: asset.resourceType,
      previewUrl: asset.resourceType === "RAW" ? null : cloudinaryService.deliveryUrl(asset.cloudinaryPublicId, kind, "e_blur_faces:800,c_limit,w_1600,q_auto,f_auto" + (kind === "video" ? ",so_0" : "")),
      sha256: asset.sha256,
      captureSource: asset.captureSource,
      capturedAt: asset.capturedAt,
      capturedAtSource: asset.capturedAtSource,
      uploadedAt: asset.createdAt,
      approximateLocation: asset.latitude === null ? null : { latitude: round(asset.latitude), longitude: round(asset.longitude) },
      locationSource: asset.locationSource,
      site: asset.site?.name ?? null,
      trustScore: asset.trustScore,
      trustStatus: asset.trustStatus,
      checks: asset.trustChecks.map(({ check, result, message, hard }) => ({ check, result, message, hard })),
      review: { status: asset.reviewStatus, reviewedAt: asset.reviewedAt },
      observation: asset.analysis ? { summary: asset.analysis.summary, activity: asset.analysis.activity } : null,
      derived: derived.map(({ kind: derivedKind, transformation, url, createdAt }) => ({ kind: derivedKind, transformation, url, createdAt })),
      delivery: delivery.filter((entry) => entry.purpose !== "Thumbnail in the app"),
    },
  });
};
