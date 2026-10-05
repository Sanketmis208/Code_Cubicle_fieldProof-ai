import { AnalysisStatus, type CaptureSource, type Prisma, ResourceType } from '@prisma/client';
import type { Actor } from '../authz/actor.js';
import { prisma } from '../lib/prisma.js';
import { readExif, sha256, type ExifSummary } from '../trust/provenance.js';
import { ingestTrust } from '../trust/service.js';
import { auditService } from './audit.service.js';
import { cloudinaryService } from './cloudinary.service.js';

export const evidenceInclude = {
  project: { select: { id: true, name: true, location: true, category: true } },
  analysis: true,
  eventCluster: { select: { id: true, assetCount: true, representativeIds: true, startedAt: true, endedAt: true } },
  site: { select: { id: true, name: true } },
} as const;

export type IncomingFile = { buffer: Buffer; originalname: string; mimetype: string };

/** Facts a live capture (browser or app) records at the shutter, instead of trusting file metadata. */
export type LiveCapture = {
  capturedAt: Date;
  /** SERVER when the device clock was ignored, DEVICE when it came from the phone's trusted clock. */
  timeSource: 'SERVER' | 'DEVICE';
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  device?: { signatureValid?: boolean | null; mockLocation?: boolean | null; deviceId?: string | null; platform?: string | null };
};

export type SkippedFile = { filename: string; reason: 'ALREADY_UPLOADED' | 'DUPLICATE_IN_BATCH'; existingAssetId?: string };

/**
 * Stores evidence with its provenance and runs the trust pipeline.
 * SHA-256 and EXIF come from the original bytes on this server; perceptual
 * hash, focus quality and faces come from Cloudinary's upload analysis.
 * Byte-identical re-uploads to the same project are skipped (and reported),
 * never silently duplicated; across projects they are stored and flagged.
 */
export async function storeEvidence(
  actor: Actor,
  projectId: string,
  files: IncomingFile[],
  options: { captureSource: CaptureSource; capturedByName?: string | null; live?: LiveCapture },
) {
  const prepared = await Promise.all(
    files.map(async (file) => ({ file, hash: sha256(file.buffer), exif: await readExif(file.buffer, file.mimetype) })),
  );
  const existing = await prisma.asset.findMany({
    where: { sha256: { in: prepared.map((entry) => entry.hash) }, project: { organizationId: actor.organizationId } },
    select: { id: true, sha256: true, projectId: true },
    orderBy: { createdAt: 'asc' },
  });
  const skipped: SkippedFile[] = [];
  const seen = new Set<string>();
  const toStore = prepared.filter(({ file, hash }) => {
    if (seen.has(hash)) {
      skipped.push({ filename: file.originalname, reason: 'DUPLICATE_IN_BATCH' });
      return false;
    }
    seen.add(hash);
    const sameProject = existing.find((row) => row.sha256 === hash && row.projectId === projectId);
    if (sameProject) {
      skipped.push({ filename: file.originalname, reason: 'ALREADY_UPLOADED', existingAssetId: sameProject.id });
      return false;
    }
    return true;
  });

  const created: string[] = [];
  const uploadedIds: Array<{ publicId: string; resourceType: string }> = [];
  try {
    for (const { file, hash, exif } of toStore) {
      const image = file.mimetype.startsWith('image/');
      const { result: uploaded, requested } = await cloudinaryService.uploadWithAnalysis(
        file.buffer,
        {
          folder: `fieldproof/${actor.organizationId}/${projectId}`,
          context: `project_id=${projectId}|original_filename=${file.originalname.replace(/[=|]/g, ' ')}|sha256=${hash}`,
        },
        image,
      );
      uploadedIds.push({ publicId: uploaded.public_id, resourceType: uploaded.resource_type });
      const analysis = uploaded as unknown as {
        phash?: string; quality_analysis?: { focus?: number }; faces?: number[][];
      };
      const live = options.live;
      const data: Prisma.AssetUncheckedCreateInput = {
        projectId,
        uploadedById: actor.userId,
        captureSource: options.captureSource,
        capturedByName: options.capturedByName?.trim() || null,
        cloudinaryPublicId: uploaded.public_id,
        cloudinaryAssetId: uploaded.asset_id,
        resourceType: uploaded.resource_type === 'video' ? ResourceType.VIDEO : uploaded.resource_type === 'raw' ? ResourceType.RAW : ResourceType.IMAGE,
        secureUrl: uploaded.secure_url,
        originalFilename: file.originalname,
        width: uploaded.width,
        height: uploaded.height,
        bytes: uploaded.bytes,
        format: uploaded.format,
        sha256: hash,
        phash: typeof analysis.phash === 'string' ? analysis.phash.toLowerCase() : null,
        exif: (exif ?? undefined) as Prisma.InputJsonValue | undefined,
        qualityScore: typeof analysis.quality_analysis?.focus === 'number' ? analysis.quality_analysis.focus : null,
        faceCount: Array.isArray(analysis.faces) ? analysis.faces.length : null,
        cloudinaryAnalysis: {
          requested,
          phash: analysis.phash ?? null,
          quality_analysis: analysis.quality_analysis ?? null,
          faces: analysis.faces ?? null,
          ...(live?.device ? { device: live.device } : {}),
        } as Prisma.InputJsonValue,
        ...provenanceFields(exif, live),
        aiStatus: AnalysisStatus.NOT_REQUESTED,
      };
      const asset = await prisma.asset.create({ data, select: { id: true } });
      created.push(asset.id);
    }
  } catch (error) {
    // All or nothing: undo stored rows and uploaded files from this request.
    if (created.length) await prisma.asset.deleteMany({ where: { id: { in: created } } });
    for (const upload of uploadedIds)
      await cloudinaryService.deleteResource(upload.publicId, upload.resourceType as 'image' | 'video' | 'raw').catch(() => undefined);
    throw error;
  }

  // Trust runs after storage so a slow or failing check never loses evidence.
  for (const id of created)
    await ingestTrust(id).catch((error: unknown) =>
      console.error('Trust evaluation failed for', id, error instanceof Error ? error.message : error),
    );

  const assets = await prisma.asset.findMany({ where: { id: { in: created } }, include: evidenceInclude, orderBy: { createdAt: 'asc' } });
  const clusters = [...new Map(assets.filter((asset) => asset.eventCluster).map((asset) => [asset.eventCluster!.id, asset.eventCluster!])).values()];
  if (created.length)
    await auditService.record({
      organizationId: actor.organizationId, actorId: actor.userId, action: 'evidence.uploaded',
      entityType: 'Project', entityId: projectId,
      metadata: { count: created.length, skipped: skipped.length, source: options.captureSource, assetIds: created },
    });
  return { assets, skipped, clusters };
}

function provenanceFields(exif: ExifSummary | null, live?: LiveCapture) {
  if (live)
    return {
      capturedAt: live.capturedAt,
      capturedAtSource: live.timeSource,
      latitude: live.latitude ?? null,
      longitude: live.longitude ?? null,
      locationSource: live.latitude != null && live.longitude != null ? 'DEVICE' : null,
      gpsAccuracyM: live.accuracyM ?? null,
    };
  return {
    capturedAt: exif?.capturedAt ? new Date(exif.capturedAt) : null,
    capturedAtSource: exif?.capturedAt ? 'EXIF' : null,
    latitude: exif?.latitude ?? null,
    longitude: exif?.longitude ?? null,
    locationSource: exif?.latitude !== undefined ? 'EXIF' : null,
  };
}
