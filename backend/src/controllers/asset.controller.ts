import type { RequestHandler } from "express";
import { AnalysisStatus, Prisma, ResourceType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { cloudinaryService } from "../services/cloudinary.service.js";
import { aiService } from "../services/ai.service.js";
import { AppError } from "../utils/app-error.js";
import type { AssetAnalysisResult, EvidenceSearchIntent } from "../ai/ai.schemas.js";
import { assertMediaSignature } from "../middleware/upload.js";
import { reportReferencesEvidence } from "../utils/report-references.js";

const assetInclude = {
  project: { select: { id: true, name: true, location: true, category: true } },
  analysis: true,
} as const;

async function ownedProject(projectId: string, ownerId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: { id: true, name: true },
  });
  if (!project) throw new AppError(404, "Project not found");
  return project;
}

async function ownedAsset(id: string, ownerId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id, project: { ownerId } },
    include: assetInclude,
  });
  if (!asset) throw new AppError(404, "Evidence asset not found");
  return asset;
}

export const listAssets: RequestHandler = async (req, res) => {
  const {
    projectId,
    resourceType,
    activity,
    search,
    favorite,
    sort,
    from,
    to,
    page,
    limit,
  } = (req.validatedQuery ?? req.query) as Record<string, any>;
  const evidenceDateRange = {
    ...(from && { gte: from }),
    ...(to && { lte: to }),
  };
  const where: Prisma.AssetWhereInput = {
    project: { ownerId: req.userId },
    ...(projectId && { projectId }),
    ...(resourceType && { resourceType }),
    ...(favorite !== undefined && { favorite }),
    ...(activity && { activity: { contains: activity, mode: "insensitive" } }),
    // Date range and keyword search are both OR-groups; they must be ANDed,
    // otherwise the second spread overwrites the first and drops the filter.
    AND: [
      ...(from || to
        ? [{ OR: [{ capturedAt: evidenceDateRange }, { capturedAt: null, createdAt: evidenceDateRange }] }]
        : []),
      ...(search
        ? [{
      OR: [
        { originalFilename: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { activity: { contains: search, mode: "insensitive" } },
        { locationName: { contains: search, mode: "insensitive" } },
        { analysis: { is: { summary: { contains: search, mode: "insensitive" } } } },
        { analysis: { is: { activity: { contains: search, mode: "insensitive" } } } },
        { analysis: { is: { locationType: { contains: search, mode: "insensitive" } } } },
      ],
          }]
        : []),
    ],
  };
  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: assetInclude,
      orderBy:
        sort === "oldest"
          ? { createdAt: "asc" }
          : sort === "filename"
            ? { originalFilename: "asc" }
            : { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.asset.count({ where }),
  ]);
  res.json({
    assets,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

export const getAsset: RequestHandler = async (req, res) =>
  res.json({ asset: await ownedAsset(req.params.id as string, req.userId!) });

export const setFavorite: RequestHandler = async (req, res) => {
  const asset = await ownedAsset(req.params.id as string, req.userId!);
  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: { favorite: req.body.favorite },
    include: assetInclude,
  });
  res.json({ asset: updated });
};

export const uploadAssets: RequestHandler = async (req, res) => {
  const projectId = String(req.body.projectId ?? "");
  await ownedProject(projectId, req.userId!);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length) throw new AppError(422, "Select at least one image or video");
  files.forEach(assertMediaSignature);

  const created = [];
  try {
    for (const file of files) {
      const uploaded = await cloudinaryService.uploadBuffer(file.buffer, {
        folder: `fieldproof/${req.userId}/${projectId}`,
        context: `project_id=${projectId}|original_filename=${file.originalname.replace(/[=|]/g, " ")}`,
      });
      try {
      const asset = await prisma.asset.create({
        data: {
          projectId,
          cloudinaryPublicId: uploaded.public_id,
          cloudinaryAssetId: uploaded.asset_id,
          resourceType:
            uploaded.resource_type === "video"
              ? ResourceType.VIDEO
              : uploaded.resource_type === "raw"
                ? ResourceType.RAW
                : ResourceType.IMAGE,
          secureUrl: uploaded.secure_url,
          originalFilename: file.originalname,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          format: uploaded.format,
          // Cloudinary's created_at is the upload time, not a trustworthy capture time.
          // Keep capturedAt null until genuine capture metadata is available.
          capturedAt: null,
          aiStatus: AnalysisStatus.NOT_REQUESTED,
        },
        include: assetInclude,
      });
      created.push(asset);
      } catch (error) {
        await cloudinaryService
          .deleteResource(
            uploaded.public_id,
            uploaded.resource_type as "image" | "video" | "raw",
          )
          .catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    for (const asset of created) {
      await cloudinaryService
        .deleteResource(
          asset.cloudinaryPublicId,
          asset.resourceType.toLowerCase() as "image" | "video" | "raw",
        )
        .catch(() => undefined);
    }
    if (created.length)
      await prisma.asset.deleteMany({ where: { id: { in: created.map((asset) => asset.id) } } });
    throw error;
  }
  res.status(201).json({ assets: created });
};

export const deleteAsset: RequestHandler = async (req, res) => {
  const asset = await ownedAsset(req.params.id as string, req.userId!);
  const [comparisonCount, reports] = await Promise.all([
    prisma.comparison.count({
      where: { OR: [{ beforeAssetId: asset.id }, { afterAssetId: asset.id }] },
    }),
    prisma.report.findMany({
      where: { projectId: asset.projectId },
      select: { content: true },
    }),
  ]);
  if (comparisonCount)
    throw new AppError(
      409,
      "Remove this asset from its comparisons before deleting it",
    );
  if (reports.some((report) => reportReferencesEvidence(report.content, asset.id)))
    throw new AppError(
      409,
      "Delete or regenerate reports that reference this asset before deleting it",
    );
  await prisma.asset.delete({ where: { id: asset.id } });
  await cloudinaryService.deleteResources([asset]);
  res.status(204).send();
};

async function persistAnalysis(
  asset: Awaited<ReturnType<typeof ownedAsset>>,
  result: AssetAnalysisResult,
  representativeFrames: string[],
) {
  const data = {
    summary: result.summary,
    detailedDescription: result.detailedDescription,
    activity: result.activity,
    projectCategoryHints: result.projectCategoryHints,
    locationType: result.locationType,
    visibleSubjects: result.visibleSubjects,
    environmentalSignals: result.environmentalSignals,
    infrastructureSignals: result.infrastructureSignals,
    detectedObjects: result.detectedObjects,
    tags: result.tags,
    visualQuality: result.imageQuality,
    evidenceStrength: result.evidenceStrength,
    evidenceUsefulness: result.evidenceUsefulness,
    uncertainties: result.uncertainties,
    representativeFrames,
    confidence: result.confidence,
    rawResponse: result,
    model: aiService.model,
    analysisVersion: 2,
  } satisfies Omit<Prisma.AssetAnalysisUncheckedCreateInput, "assetId">;
  const analysis = await prisma.assetAnalysis.upsert({
    where: { assetId: asset.id },
    create: { assetId: asset.id, ...data },
    update: data,
  });
  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      aiStatus: AnalysisStatus.COMPLETED,
      activity: result.activity,
      description: result.summary,
      analysisError: null,
      lastAnalyzedAt: new Date(),
    },
  });
  const metadataTags = [
    ...result.tags,
    ...result.environmentalSignals.map((signal) => signal.type),
  ];
  await cloudinaryService
    .applyAnalysisMetadata(
      asset.cloudinaryPublicId,
      asset.resourceType.toLowerCase() as "image" | "video",
      [...new Set(metadataTags)],
      {
        activity: result.activity,
        evidence_summary: result.summary.slice(0, 900),
        evidence_strength: result.evidenceStrength,
        ai_model: aiService.model,
      },
    )
    .catch((error: unknown) =>
      console.warn(
        "Optional Cloudinary metadata sync failed:",
        error instanceof Error ? error.message : "unknown error",
      ),
    );
  return analysis;
}

const STALE_ANALYSIS_MS = 5 * 60 * 1000;
const isStaleProcessing = (startedAt: Date | null) =>
  !startedAt || Date.now() - startedAt.getTime() > STALE_ANALYSIS_MS;

async function processAnalysis(id: string, ownerId: string, force: boolean) {
  const asset = await ownedAsset(id, ownerId);
  if (asset.resourceType === ResourceType.RAW)
    throw new AppError(422, "AI analysis supports image and video assets");
  if (asset.aiStatus === AnalysisStatus.PROCESSING && !isStaleProcessing(asset.analysisStartedAt))
    throw new AppError(409, "This asset is already being analyzed");
  if (asset.analysis && asset.aiStatus === AnalysisStatus.COMPLETED && !force)
    return { analysis: asset.analysis, cached: true };

  const staleBefore = new Date(Date.now() - STALE_ANALYSIS_MS);
  const claimed = await prisma.asset.updateMany({
    where: {
      id: asset.id,
      OR: [
        { aiStatus: { not: AnalysisStatus.PROCESSING } },
        // A crash or restart mid-analysis would otherwise lock the asset forever.
        { analysisStartedAt: null },
        { analysisStartedAt: { lt: staleBefore } },
      ],
    },
    data: {
      aiStatus: AnalysisStatus.PROCESSING,
      analysisStartedAt: new Date(),
      analysisError: null,
      analysisAttempts: { increment: 1 },
    },
  });
  if (!claimed.count)
    throw new AppError(409, "This asset is already being analyzed");
  try {
    const representativeFrames =
      asset.resourceType === ResourceType.VIDEO
        ? cloudinaryService.videoFrameUrls(asset.cloudinaryPublicId)
        : [];
    const result =
      asset.resourceType === ResourceType.VIDEO
        ? await aiService.analyzeVideoFrames(representativeFrames)
        : await aiService.analyzeImage(asset.secureUrl);
    return {
      analysis: await persistAnalysis(asset, result, representativeFrames),
      cached: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    await prisma.asset.update({
      where: { id: asset.id },
      data: { aiStatus: AnalysisStatus.FAILED, analysisError: message.slice(0, 1000) },
    });
    throw error;
  }
}

export const analyzeAsset: RequestHandler = async (req, res) => {
  res.json(
    await processAnalysis(
      req.params.id as string,
      req.userId!,
      Boolean(req.body?.force),
    ),
  );
};

export const retryAssetAnalysis: RequestHandler = async (req, res) => {
  res.json(await processAnalysis(req.params.id as string, req.userId!, true));
};

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function matchesIntent(
  asset: Awaited<ReturnType<typeof ownedAsset>>,
  intent: EvidenceSearchIntent,
) {
  const evidenceDate = asset.capturedAt ?? asset.createdAt;
  if (intent.dateFrom && evidenceDate < new Date(`${intent.dateFrom}T00:00:00.000Z`)) return false;
  if (intent.dateTo && evidenceDate > new Date(`${intent.dateTo}T23:59:59.999Z`)) return false;
  const analysis = asset.analysis;
  const signals = [
    ...(Array.isArray(analysis?.environmentalSignals) ? analysis.environmentalSignals : []),
    ...(Array.isArray(analysis?.infrastructureSignals) ? analysis.infrastructureSignals : []),
  ];
  const searchable = [
    asset.originalFilename,
    asset.activity,
    asset.description,
    asset.locationName,
    asset.project.name,
    asset.project.location,
    asset.project.category,
    analysis?.summary,
    analysis?.detailedDescription,
    analysis?.activity,
    analysis?.locationType,
    ...stringArray(analysis?.tags),
    ...stringArray(analysis?.detectedObjects),
    ...stringArray(analysis?.visibleSubjects),
    JSON.stringify(signals),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const anyMatch = (terms: string[]) =>
    !terms.length || terms.some((term) => searchable.includes(term.toLowerCase()));
  const meaningfulFreeText = intent.freeTextTerms.filter(
    (term) => !["evidence", "image", "images", "photo", "photos", "media", "show", "find"].includes(term.toLowerCase()),
  );
  return (
    anyMatch(intent.activities) &&
    anyMatch(intent.tags) &&
    anyMatch(intent.signals) &&
    anyMatch(intent.locationTerms) &&
    meaningfulFreeText.every((term) => searchable.includes(term.toLowerCase()))
  );
}

function explainIntent(intent: EvidenceSearchIntent, projectNames: Map<string, string>) {
  const explanation: string[] = [];
  if (intent.projectIds.length)
    explanation.push(`Projects: ${intent.projectIds.map((id) => projectNames.get(id)).filter(Boolean).join(", ")}`);
  if (intent.activities.length) explanation.push(`Activities: ${intent.activities.join(", ")}`);
  if (intent.tags.length) explanation.push(`Tags: ${intent.tags.join(", ")}`);
  if (intent.signals.length) explanation.push(`Signals: ${intent.signals.join(", ")}`);
  if (intent.locationTerms.length) explanation.push(`Locations: ${intent.locationTerms.join(", ")}`);
  if (intent.mediaTypes.length) explanation.push(`Media: ${intent.mediaTypes.map((type) => type.toLowerCase()).join(", ")}`);
  if (intent.dateFrom || intent.dateTo)
    explanation.push(`Date: ${intent.dateFrom ?? "any"} to ${intent.dateTo ?? "any"}`);
  if (intent.freeTextTerms.length) explanation.push(`Keywords: ${intent.freeTextTerms.join(", ")}`);
  return explanation;
}

export const naturalLanguageSearch: RequestHandler = async (req, res) => {
  const { query, page, limit } = req.body as { query: string; page: number; limit: number };
  const projects = await prisma.project.findMany({
    where: { ownerId: req.userId },
    select: { id: true, name: true },
  });
  const allowedIds = new Set(projects.map((project) => project.id));
  const parsed = await aiService.parseEvidenceSearch(query, projects);
  const intent = {
    ...parsed,
    projectIds: parsed.projectIds.filter((id) => allowedIds.has(id)),
  };
  const candidates = await prisma.asset.findMany({
    where: {
      project: { ownerId: req.userId },
      ...(intent.projectIds.length && { projectId: { in: intent.projectIds } }),
      ...(intent.mediaTypes.length && {
        resourceType: { in: intent.mediaTypes as ResourceType[] },
      }),
    },
    include: assetInclude,
    orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const matches = candidates.filter((asset) => matchesIntent(asset, intent));
  const offset = (page - 1) * limit;
  res.json({
    assets: matches.slice(offset, offset + limit),
    intent,
    explanation: explainIntent(
      intent,
      new Map(projects.map((project) => [project.id, project.name])),
    ),
    pagination: {
      page,
      limit,
      total: matches.length,
      pages: Math.ceil(matches.length / limit),
    },
  });
};
