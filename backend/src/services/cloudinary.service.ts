import { Readable } from "node:stream";
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from "cloudinary";
import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

const configured = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
);
if (configured)
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

function requireConfiguration() {
  if (!configured) throw new AppError(503, "Cloudinary is not configured");
}

export const cloudinaryService = {
  isConfigured: () => configured,

  async verifyConnection() {
    requireConfiguration();
    await cloudinary.api.ping();
  },

  videoFrameUrls(publicId: string) {
    requireConfiguration();
    return ["10%", "50%", "90%"].map((position) =>
      cloudinary.url(publicId, {
        resource_type: "video",
        type: "upload",
        secure: true,
        format: "jpg",
        transformation: [
          {
            start_offset: position,
            width: 1280,
            height: 720,
            crop: "limit",
            quality: "auto:good",
          },
        ],
      }),
    );
  },

  /**
   * Image upload that also asks Cloudinary for its upload-time analysis
   * (perceptual hash, focus quality, face boxes). Some analyses depend on the
   * account plan; if Cloudinary refuses them, the upload is retried with less
   * rather than failing, and `requested` records what was actually returned.
   */
  async uploadWithAnalysis(buffer: Buffer, options: UploadApiOptions, image: boolean) {
    const attempts: UploadApiOptions[] = image
      ? [{ phash: true, quality_analysis: true, faces: true }, { phash: true, faces: true }, { phash: true }, {}]
      : [{}];
    let lastError: unknown;
    for (const analysis of attempts) {
      try {
        const result = await cloudinaryService.uploadBuffer(buffer, { ...options, ...analysis });
        return { result, requested: Object.keys(analysis) };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
        // Only plan/feature refusals are worth retrying; anything else is a real failure.
        if (!/quality|phash|faces|analysis|not (enabled|allowed|supported)|plan/i.test(message)) throw error;
      }
    }
    throw lastError;
  },

  /**
   * Delivery URLs are deterministic transformations of the original, which is
   * what makes every derived file reproducible (and listable in the passport).
   */
  deliveryUrl(publicId: string, resourceType: "image" | "video", transformation: string) {
    requireConfiguration();
    return cloudinary.url(publicId, {
      resource_type: resourceType, type: "upload", secure: true, raw_transformation: transformation,
      ...(resourceType === "video" ? { format: "jpg" } : {}),
    });
  },

  /** A JPEG at most 1280 px for the vision model: fixes iPhone HEIC and keeps payloads small. */
  analysisImageUrl(publicId: string) {
    requireConfiguration();
    return cloudinary.url(publicId, {
      resource_type: "image", type: "upload", secure: true, format: "jpg",
      transformation: [{ width: 1280, height: 1280, crop: "limit", quality: "auto" }],
    });
  },

  uploadBuffer(
    buffer: Buffer,
    options: UploadApiOptions,
  ): Promise<UploadApiResponse> {
    requireConfiguration();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          type: "upload",
          use_filename: true,
          unique_filename: true,
          overwrite: false,
          ...options,
        },
        (error, result) =>
          error || !result
            ? reject(error ?? new Error("Cloudinary returned no upload result"))
            : resolve(result),
      );
      Readable.from(buffer).pipe(stream);
    });
  },

  async deleteResource(
    publicId: string,
    resourceType: "image" | "video" | "raw",
  ) {
    requireConfiguration();
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    if (!["ok", "not found"].includes(result.result))
      throw new AppError(502, "Cloudinary could not remove the asset");
    return result;
  },

  /** Best-effort cleanup after the database rows are gone; never throws. */
  async deleteResources(
    assets: Array<{ cloudinaryPublicId: string; resourceType: string }>,
  ) {
    if (!cloudinaryService.isConfigured()) return;
    for (const asset of assets) {
      await cloudinaryService.deleteResource(
        asset.cloudinaryPublicId,
        asset.resourceType.toLowerCase() as "image" | "video" | "raw",
      ).catch((error: unknown) =>
        console.warn(
          `Cloudinary cleanup failed for ${asset.cloudinaryPublicId}:`,
          error instanceof Error ? error.message : "unknown error",
        ),
      );
    }
  },

  async applyAnalysisMetadata(
    publicId: string,
    resourceType: "image" | "video" | "raw",
    tags: string[],
    context: Record<string, string>,
  ) {
    requireConfiguration();
    // One call for tags and context together (was one call per tag).
    await cloudinary.uploader.explicit(publicId, {
      type: "upload",
      resource_type: resourceType,
      tags: tags.slice(0, 20).map((tag) => tag.replace(/,/g, " ").slice(0, 60)),
      context: Object.entries(context)
        .map(([key, value]) => `${key}=${value.replace(/[=|]/g, " ")}`)
        .join("|"),
    });
  },
};
