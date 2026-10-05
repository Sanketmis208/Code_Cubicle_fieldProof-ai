import { createPublicKey, verify } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";
import { actorForProject, actorFromRequest, can, projectWhere } from "../authz/actor.js";
import { prisma } from "../lib/prisma.js";
import { assertMediaSignature } from "../middleware/upload.js";
import { auditService } from "../services/audit.service.js";
import { storeEvidence, type LiveCapture } from "../services/evidence.service.js";
import { sha256 } from "../trust/provenance.js";
import { AppError } from "../utils/app-error.js";

/** DER prefix that turns a raw 32-byte Ed25519 key into SPKI form for node:crypto. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
/** Offline captures are accepted for a week; older ones were not "live". */
const MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;

export function verifyEd25519(publicKeyBase64: string, message: Buffer, signatureBase64: string) {
  try {
    const raw = Buffer.from(publicKeyBase64, "base64");
    if (raw.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
    return verify(null, message, key, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

/** Server clock for the capture clients: the app stores the offset, the browser never trusts its own clock. */
export const serverTime: RequestHandler = (_req, res) => {
  res.json({ serverTime: new Date().toISOString() });
};

/** Projects this person can capture into, with sites for the on-screen "inside site" badge. */
export const captureProjects: RequestHandler = async (req, res) => {
  const actor = await actorFromRequest(req);
  if (!can(actor, "evidence.upload")) return res.json({ projects: [], canCapture: false });
  const projects = await prisma.project.findMany({
    where: { ...projectWhere(actor), status: { in: ["PLANNING", "ACTIVE"] } },
    select: { id: true, name: true, location: true, status: true, sites: { select: { id: true, name: true, latitude: true, longitude: true, radiusM: true } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ projects, canCapture: true, organizationId: actor.organizationId });
};

export const registerDevice: RequestHandler = async (req, res) => {
  const { publicKey, platform, model, appVersion } = req.body as { publicKey: string; platform: string; model?: string; appVersion?: string };
  if (Buffer.from(publicKey, "base64").length !== 32) throw new AppError(422, "publicKey must be a base64 Ed25519 public key (32 bytes)");
  const device = await prisma.device.create({
    data: { userId: req.userId!, publicKey, platform, model: model ?? null, appVersion: appVersion ?? null, lastSeenAt: new Date() },
    select: { id: true, platform: true, model: true, createdAt: true },
  });
  res.status(201).json({ device });
};

const manifestSchema = z.object({
  clientCaptureId: z.string().min(8).max(64),
  projectId: z.string().cuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  capturedAt: z.string().datetime(),
  /** TRUSTED: server time + monotonic clock since last sync. DEVICE: the phone's wall clock. */
  timeSource: z.enum(["TRUSTED", "DEVICE"]),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().min(0).max(100_000).nullable(),
  mockLocation: z.boolean().nullable(),
  deviceId: z.string().cuid().optional(),
});

/**
 * One live capture. `manifest` is sent as the exact string that was signed;
 * the signature is checked over those bytes, then the facts are parsed.
 * Web captures (no signature) use server time and ignore the browser clock.
 */
export const uploadCapture: RequestHandler = async (req, res) => {
  const file = (req.files as Express.Multer.File[] | undefined)?.[0];
  if (!file) throw new AppError(422, "Attach the captured photo or video");
  assertMediaSignature(file);
  const source = req.body.source === "APP" ? "APP" : "WEB";
  const rawManifest = typeof req.body.manifest === "string" ? req.body.manifest : "";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawManifest);
  } catch {
    throw new AppError(422, "manifest must be JSON");
  }
  const parsed = manifestSchema.safeParse(parsedJson);
  if (!parsed.success) throw new AppError(422, "Invalid capture manifest", parsed.error.flatten());
  const manifest = parsed.data;
  const actor = await actorForProject(req.userId!, manifest.projectId, "evidence.upload");

  const bytesMatch = sha256(file.buffer) === manifest.sha256.toLowerCase();
  let signatureValid: boolean | null = null;
  let device: { id: string; platform: string } | null = null;
  if (source === "APP") {
    if (!manifest.deviceId || typeof req.body.signature !== "string")
      throw new AppError(422, "App captures must include deviceId and signature");
    const enrolled = await prisma.device.findFirst({ where: { id: manifest.deviceId, userId: actor.userId, revokedAt: null } });
    if (!enrolled) throw new AppError(403, "This device is not enrolled for your account", undefined, "DEVICE_UNKNOWN");
    device = { id: enrolled.id, platform: enrolled.platform };
    // Both must hold: the facts are signed by this device, and the bytes are the signed bytes.
    signatureValid = bytesMatch && verifyEd25519(enrolled.publicKey, Buffer.from(rawManifest, "utf8"), req.body.signature);
    await prisma.device.update({ where: { id: enrolled.id }, data: { lastSeenAt: new Date() } });
  } else if (!bytesMatch) throw new AppError(422, "The file does not match the capture fingerprint; please capture again", undefined, "HASH_MISMATCH");

  const now = Date.now();
  const claimed = Date.parse(manifest.capturedAt);
  const appTimeUsable = source === "APP" && claimed <= now + 2 * 60 * 1000 && claimed >= now - MAX_OFFLINE_MS;
  const live: LiveCapture = {
    capturedAt: appTimeUsable ? new Date(claimed) : new Date(now),
    timeSource: appTimeUsable ? "DEVICE" : "SERVER",
    latitude: manifest.latitude,
    longitude: manifest.longitude,
    accuracyM: manifest.accuracyM,
    device: {
      signatureValid,
      mockLocation: manifest.mockLocation,
      deviceId: device?.id ?? null,
      platform: device?.platform ?? "web",
      clientCaptureId: manifest.clientCaptureId,
      reportedTimeSource: manifest.timeSource,
    },
  };
  const result = await storeEvidence(actor, manifest.projectId, [file], {
    captureSource: source === "APP" ? "APP_CAPTURE" : "WEB_LIVE_CAPTURE",
    live,
  });
  if (source === "APP" && signatureValid === false)
    await auditService.record({
      organizationId: actor.organizationId, actorId: actor.userId, action: "capture.signature_failed",
      entityType: "Device", entityId: device?.id ?? null, metadata: { projectId: manifest.projectId, bytesMatch },
    });
  res.status(result.assets.length ? 201 : 200).json(result);
};
