import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { evaluateTrust, type Authenticity, type RelatedAsset } from './engine.js';
import { distanceMeters, phashDistance, type ExifSummary } from './provenance.js';

/** Hamming distance (of 64 bits) at or below which two images count as the same picture. */
export const NEAR_DUPLICATE_DISTANCE = 8;
/** Shots this close in time and place are one event. */
const EVENT_GAP_MS = 15 * 60 * 1000;
const EVENT_RADIUS_M = 150;

type Tx = Prisma.TransactionClient;

const effectiveAt = (asset: { capturedAt: Date | null; createdAt: Date }) => asset.capturedAt ?? asset.createdAt;

/** Recomputes an event's span, size and best shots from its current members (or removes it when empty). */
export async function refreshCluster(clusterId: string, tx: Tx | typeof prisma = prisma) {
  const members = await tx.asset.findMany({
    where: { eventClusterId: clusterId },
    select: { id: true, capturedAt: true, createdAt: true, latitude: true, longitude: true, qualityScore: true, resourceType: true },
  });
  if (!members.length) {
    await tx.eventCluster.deleteMany({ where: { id: clusterId } });
    return;
  }
  const times = members.map((member) => effectiveAt(member).getTime());
  const located = members.filter((member) => member.latitude !== null && member.longitude !== null);
  // Best shots: images first, then sharpest, then earliest.
  const representatives = [...members]
    .sort((a, b) =>
      Number(b.resourceType === 'IMAGE') - Number(a.resourceType === 'IMAGE') ||
      (b.qualityScore ?? -1) - (a.qualityScore ?? -1) ||
      effectiveAt(a).getTime() - effectiveAt(b).getTime(),
    )
    .slice(0, 3)
    .map((member) => member.id);
  await tx.eventCluster.update({
    where: { id: clusterId },
    data: {
      startedAt: new Date(Math.min(...times)),
      endedAt: new Date(Math.max(...times)),
      assetCount: members.length,
      representativeIds: representatives,
      latitude: located.length ? located.reduce((sum, m) => sum + m.latitude!, 0) / located.length : null,
      longitude: located.length ? located.reduce((sum, m) => sum + m.longitude!, 0) / located.length : null,
    },
  });
}

/** Puts an asset into the event it belongs to (same project, within 15 minutes and 150 m), or starts one. */
export async function assignEventCluster(assetId: string) {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({
      where: { id: assetId },
      select: { id: true, projectId: true, capturedAt: true, createdAt: true, latitude: true, longitude: true, eventClusterId: true },
    });
    // Serialize per project so two parallel uploads cannot open twin events.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cluster:${asset.projectId}`}))`;
    const at = effectiveAt(asset).getTime();
    const candidates = await tx.eventCluster.findMany({
      where: {
        projectId: asset.projectId,
        startedAt: { lte: new Date(at + EVENT_GAP_MS) },
        endedAt: { gte: new Date(at - EVENT_GAP_MS) },
      },
      orderBy: { startedAt: 'asc' },
    });
    const match = candidates.find((cluster) =>
      cluster.latitude === null || cluster.longitude === null || asset.latitude === null || asset.longitude === null ||
      distanceMeters(asset as { latitude: number; longitude: number }, cluster as { latitude: number; longitude: number }) <= EVENT_RADIUS_M,
    );
    const clusterId = match?.id ?? (
      await tx.eventCluster.create({
        data: { projectId: asset.projectId, startedAt: new Date(at), endedAt: new Date(at), latitude: asset.latitude, longitude: asset.longitude },
      })
    ).id;
    const previous = asset.eventClusterId;
    await tx.asset.update({ where: { id: asset.id }, data: { eventClusterId: clusterId } });
    await refreshCluster(clusterId, tx);
    if (previous && previous !== clusterId) await refreshCluster(previous, tx);
    return clusterId;
  });
}

/** Re-runs every trust check for one asset and stores the explained result. */
export async function evaluateAssetTrust(assetId: string) {
  const asset = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    include: {
      project: { select: { id: true, organizationId: true, startDate: true, endDate: true, sites: true } },
      analysis: { select: { authenticity: true } },
    },
  });
  const organizationId = asset.project.organizationId;
  const relatedSelect = {
    id: true, projectId: true, capturedAt: true, createdAt: true, eventClusterId: true, phash: true,
    project: { select: { name: true } },
  } as const;
  // Only earlier uploads can be the original; the later copy carries the flag.
  const earlier: Prisma.AssetWhereInput = {
    id: { not: asset.id },
    project: { organizationId },
    OR: [{ createdAt: { lt: asset.createdAt } }, { createdAt: asset.createdAt, id: { lt: asset.id } }],
  };
  const [exact, hashed] = await Promise.all([
    asset.sha256
      ? prisma.asset.findMany({ where: { ...earlier, sha256: asset.sha256 }, select: relatedSelect, orderBy: { createdAt: 'asc' }, take: 5 })
      : Promise.resolve([]),
    asset.phash
      ? prisma.asset.findMany({ where: { ...earlier, phash: { not: null } }, select: relatedSelect })
      : Promise.resolve([]),
  ]);
  const related = (row: (typeof hashed)[number]): RelatedAsset => ({
    id: row.id, projectId: row.projectId, projectName: row.project.name, effectiveAt: effectiveAt(row), eventClusterId: row.eventClusterId,
  });
  const exactIds = new Set(exact.map((row) => row.id));
  const nearMatches = hashed
    .filter((row) => !exactIds.has(row.id))
    .map((row) => ({ row, distance: phashDistance(asset.phash, row.phash) }))
    .filter((entry): entry is { row: (typeof hashed)[number]; distance: number } => entry.distance !== null && entry.distance <= NEAR_DUPLICATE_DISTANCE)
    .map(({ row, distance }) => ({ ...related(row), distance }));

  const evaluation = evaluateTrust({
    captureSource: asset.captureSource,
    originalFilename: asset.originalFilename,
    resourceType: asset.resourceType,
    exif: (asset.exif as ExifSummary | null) ?? null,
    capturedAt: asset.capturedAt,
    capturedAtSource: asset.capturedAtSource,
    latitude: asset.latitude,
    longitude: asset.longitude,
    locationSource: asset.locationSource,
    gpsAccuracyM: asset.gpsAccuracyM,
    qualityScore: asset.qualityScore,
    createdAt: asset.createdAt,
    projectId: asset.projectId,
    eventClusterId: asset.eventClusterId,
    project: asset.project,
    sites: asset.project.sites,
    exactMatches: exact.map(related),
    nearMatches,
    authenticity: (asset.analysis?.authenticity as Authenticity | null) ?? null,
    device: deviceSignals(asset.cloudinaryAnalysis),
    now: new Date(),
  });

  await prisma.$transaction([
    prisma.trustCheck.deleteMany({ where: { assetId } }),
    prisma.trustCheck.createMany({
      data: evaluation.checks.map((check) => ({
        assetId, check: check.check, result: check.result, weight: check.weight, hard: check.hard,
        message: check.message, details: (check.details ?? undefined) as Prisma.InputJsonValue | undefined,
        relatedAssetId: check.relatedAssetId ?? null,
      })),
    }),
    prisma.asset.update({
      where: { id: assetId },
      data: { trustScore: evaluation.score, trustStatus: evaluation.status, trustEvaluatedAt: new Date(), siteId: evaluation.siteId },
    }),
  ]);
  return evaluation;
}

/** Live-capture device facts are stored alongside the Cloudinary analysis under `device`. */
function deviceSignals(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const device = (value as Record<string, unknown>).device;
  if (!device || typeof device !== 'object') return undefined;
  const { signatureValid, mockLocation } = device as { signatureValid?: boolean | null; mockLocation?: boolean | null };
  return { signatureValid: signatureValid ?? null, mockLocation: mockLocation ?? null };
}

/** Full pipeline for a newly stored asset: join its event, then evaluate. */
export async function ingestTrust(assetId: string) {
  await assignEventCluster(assetId);
  return evaluateAssetTrust(assetId);
}

/** After sites or dates change, every asset in the project is re-checked. */
export async function reevaluateProject(projectId: string) {
  const assets = await prisma.asset.findMany({ where: { projectId }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  for (const asset of assets) await evaluateAssetTrust(asset.id);
  return assets.length;
}
