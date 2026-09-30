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

  async applyAnalysisMetadata(
    publicId: string,
    resourceType: "image" | "video" | "raw",
    tags: string[],
    context: Record<string, string>,
  ) {
    requireConfiguration();
    await Promise.all(
      tags.slice(0, 20).map((tag) =>
        cloudinary.uploader.add_tag(tag, [publicId], {
          resource_type: resourceType,
        }),
      ),
    );
    await cloudinary.uploader.explicit(publicId, {
      type: "upload",
      resource_type: resourceType,
      context: Object.entries(context)
        .map(([key, value]) => `${key}=${value.replace(/[=|]/g, " ")}`)
        .join("|"),
    });
  },
};
