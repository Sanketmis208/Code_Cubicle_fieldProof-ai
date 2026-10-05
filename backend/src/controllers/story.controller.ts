import { randomBytes } from "node:crypto";
import type { RequestHandler } from "express";
import QRCode from "qrcode";
import { actorForProject, actorFromRequest, projectWhere } from "../authz/actor.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { auditService } from "../services/audit.service.js";
import { cloudinaryService } from "../services/cloudinary.service.js";
import { AppError } from "../utils/app-error.js";

export type StoryKind = "SQUARE_CARD" | "STORY" | "BEFORE_AFTER";

/** Cloudinary text layers need commas and slashes double-escaped. */
export function overlayText(text: string) {
  return encodeURIComponent(text.replace(/\s+/g, " ").trim()).replace(/%2C/g, "%252C").replace(/%2F/g, "%252F");
}
/** Layer IDs use ":" where a public ID has "/". */
const layerId = (publicId: string) => publicId.replace(/\//g, ":");
const shortDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

type Source = { cloudinaryPublicId: string; resourceType: string; capturedAt: Date | null; createdAt: Date; reviewStatus: string };

/**
 * Builds the transformation for one campaign asset. Every output is a pure
 * function of the original(s) plus this string, so the passport can show it
 * and anyone can reproduce the file from the source.
 */
export function storyTransformation(kind: StoryKind, input: {
  primary: Source; secondary?: Source; headline: string; subline?: string; blurFaces: boolean; qrPublicId: string; verified: boolean;
}) {
  const blur = input.blurFaces ? ",e_blur_faces:800" : "";
  const badge = input.verified ? "VERIFIED FIELD EVIDENCE" : "FIELD EVIDENCE - REVIEW PENDING";
  const text = (value: string, size: number, weight: "bold" | "normal", color: string, width: number, placement: string) =>
    `l_text:Arial_${size}${weight === "bold" ? "_bold" : ""}:${overlayText(value)},co_${color},w_${width},c_fit/e_shadow:40,x_2,y_2,co_black/fl_layer_apply,${placement}`;
  const qr = (size: number, placement: string) => `l_${layerId(input.qrPublicId)},w_${size}/fl_layer_apply,${placement}`;
  if (kind === "BEFORE_AFTER") {
    const after = input.secondary!;
    const beforeLabel = `BEFORE - ${shortDate(input.primary.capturedAt ?? input.primary.createdAt)}`;
    const afterLabel = `AFTER - ${shortDate(after.capturedAt ?? after.createdAt)}`;
    return [
      `c_fill,g_auto,w_800,h_900${blur}`,
      "c_pad,w_1600,h_900,g_west,b_rgb:0b1714",
      `l_${layerId(after.cloudinaryPublicId)},c_fill,g_auto,w_800,h_900${blur}/fl_layer_apply,g_east`,
      text(beforeLabel, 34, "bold", "white", 700, "g_north_west,x_40,y_40"),
      text(afterLabel, 34, "bold", "rgb:B9F459", 700, "g_north_east,x_40,y_40"),
      text(input.headline, 48, "bold", "white", 1200, "g_south_west,x_40,y_70"),
      text(badge, 24, "bold", "rgb:B9F459", 800, "g_south_west,x_40,y_30"),
      qr(150, "g_south_east,x_30,y_30"),
      "q_auto,f_jpg",
    ].join("/");
  }
  const [width, height, headlineSize, headlineY] = kind === "STORY" ? [1080, 1920, 72, 260] : [1080, 1080, 60, 170];
  return [
    `c_fill,g_auto,w_${width},h_${height}${blur}`,
    "e_brightness:-12",
    text(badge, 28, "bold", "rgb:B9F459", 900, "g_north_west,x_60,y_60"),
    text(input.headline, headlineSize, "bold", "white", width - 340, `g_south_west,x_60,y_${headlineY}`),
    ...(input.subline ? [text(input.subline, 34, "normal", "rgb:E8F0E4", width - 340, `g_south_west,x_60,y_${headlineY - 80}`)] : []),
    qr(200, "g_south_east,x_50,y_50"),
    "q_auto,f_jpg",
  ].join("/");
}

/** Makes sure the primary asset has a public passport and a QR image in Cloudinary that points at it. */
async function passportQr(asset: { id: string; publicToken: string | null }, organizationId: string) {
  const token = asset.publicToken ?? randomBytes(18).toString("base64url");
  if (!asset.publicToken) await prisma.asset.update({ where: { id: asset.id }, data: { publicToken: token } });
  const url = `${env.FRONTEND_URL.replace(/\/$/, "")}/passport/${token}`;
  const png = await QRCode.toBuffer(url, { margin: 2, width: 400, color: { dark: "#0b1714", light: "#ffffff" } });
  const uploaded = await cloudinaryService.uploadBuffer(png, {
    folder: `fieldproof/${organizationId}/qr`, public_id: token, overwrite: true, unique_filename: false, use_filename: false, resource_type: "image",
  });
  return { token, url, qrPublicId: uploaded.public_id };
}

export const composeStory: RequestHandler = async (req, res) => {
  const { kind, assetIds, headline, subline, blurFaces } = req.body as {
    kind: StoryKind; assetIds: string[]; headline: string; subline?: string; blurFaces: boolean;
  };
  const sources = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: {
      id: true, projectId: true, cloudinaryPublicId: true, resourceType: true, capturedAt: true, createdAt: true,
      reviewStatus: true, trustStatus: true, publicToken: true, trustChecks: { where: { hard: true }, select: { id: true } },
    },
  });
  if (sources.length !== assetIds.length) throw new AppError(404, "Evidence asset not found");
  const projectIds = [...new Set(sources.map((source) => source.projectId))];
  if (projectIds.length !== 1) throw new AppError(422, "Campaign assets use evidence from one project");
  const actor = await actorForProject(req.userId!, projectIds[0]!, "story.create", "Evidence asset not found");
  const ordered = assetIds.map((id) => sources.find((source) => source.id === id)!);
  if (ordered.some((source) => source.resourceType !== "IMAGE"))
    throw new AppError(422, "Campaign assets are built from photos; pick a still image or a video frame saved as a photo");
  // Evidence that needs a second look cannot be published until a reviewer approved it.
  const blocked = ordered.find((source) => source.reviewStatus === "REJECTED" || (source.trustChecks.length && source.reviewStatus !== "APPROVED"));
  if (blocked) throw new AppError(422, "This evidence needs a reviewer's approval before it can be published", undefined, "NEEDS_REVIEW");
  if (kind === "BEFORE_AFTER" && ordered.length !== 2) throw new AppError(422, "A before/after poster needs exactly two photos");

  const { url: passportUrl, qrPublicId } = await passportQr(ordered[0]!, actor.organizationId);
  const transformation = storyTransformation(kind, {
    primary: ordered[0]!, secondary: ordered[1], headline, subline, blurFaces, qrPublicId,
    verified: ordered.every((source) => source.reviewStatus === "APPROVED"),
  });
  const url = cloudinaryService.deliveryUrl(ordered[0]!.cloudinaryPublicId, "image", transformation);
  const derived = await prisma.derivedAsset.create({
    data: {
      organizationId: actor.organizationId, projectId: projectIds[0], sourceAssetIds: assetIds, kind, transformation, url, createdById: actor.userId,
    },
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: "story.created",
    entityType: "DerivedAsset", entityId: derived.id, metadata: { kind, sources: assetIds.length, blurFaces },
  });
  res.status(201).json({ derived, passportUrl });
};

export const listStories: RequestHandler = async (req, res) => {
  const actor = await actorFromRequest(req);
  const { projectId } = (req.validatedQuery ?? {}) as { projectId?: string };
  const projects = await prisma.project.findMany({ where: { ...projectWhere(actor), ...(projectId && { id: projectId }) }, select: { id: true } });
  const derived = await prisma.derivedAsset.findMany({
    where: { organizationId: actor.organizationId, projectId: { in: projects.map((project) => project.id) } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  res.json({ derived });
};
