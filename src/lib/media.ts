import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_FILES_PER_REQUEST = 10;

export class MediaConfigError extends Error {
  readonly code = "media_not_configured" as const;
  constructor() {
    super("S3 media storage is not configured");
  }
}

export class MediaValidationError extends Error {
  constructor(
    readonly code: "unsupported_content_type" | "too_many_files" | "invalid_file",
    message: string,
  ) {
    super(message);
  }
}

export function isMediaStorageConfigured(): boolean {
  return Boolean(env.AWS_REGION && env.S3_MEDIA_BUCKET);
}

function requireMediaConfig(): void {
  if (!isMediaStorageConfigured()) {
    throw new MediaConfigError();
  }
}

function s3Client(): S3Client {
  requireMediaConfig();
  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: env.AWS_REGION!,
  };
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return new S3Client(config);
}

export function publicUrlForKey(key: string): string {
  if (env.CDN_BASE_URL) {
    return `${env.CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  return `https://${env.S3_MEDIA_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${encodeURI(key)}`;
}

function extensionFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
    case "image/heif":
      return "heic";
    default:
      return "jpg";
  }
}

function extensionFromFilename(filename: string | undefined): string | undefined {
  if (!filename?.includes(".")) return undefined;
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext || !/^[a-z0-9]+$/.test(ext)) return undefined;
  return ext;
}

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  headers: { "Content-Type": string };
}

export async function createPresignedImageUpload(input: {
  userId: string;
  contentType: string;
  filename?: string;
}): Promise<PresignedUpload> {
  requireMediaConfig();

  const contentType = input.contentType.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new MediaValidationError(
      "unsupported_content_type",
      `Unsupported content type. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(", ")}`,
    );
  }

  const ext =
    extensionFromFilename(input.filename) ?? extensionFromContentType(contentType);
  const prefix = env.S3_MEDIA_PREFIX.replace(/^\/+|\/+$/g, "");
  const key = `${prefix}/${input.userId}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: env.S3_MEDIA_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const expiresIn = env.S3_PRESIGN_EXPIRES_SEC;
  const uploadUrl = await getSignedUrl(s3Client(), command, { expiresIn });

  return {
    uploadUrl,
    publicUrl: publicUrlForKey(key),
    key,
    expiresIn,
    headers: { "Content-Type": contentType },
  };
}

export async function createPresignedImageUploads(
  userId: string,
  files: { contentType: string; filename?: string }[],
): Promise<PresignedUpload[]> {
  if (files.length > MAX_FILES_PER_REQUEST) {
    throw new MediaValidationError(
      "too_many_files",
      `At most ${MAX_FILES_PER_REQUEST} files per request`,
    );
  }
  if (files.length === 0) {
    throw new MediaValidationError("invalid_file", "At least one file is required");
  }
  return Promise.all(
    files.map((file) =>
      createPresignedImageUpload({
        userId,
        contentType: file.contentType,
        filename: file.filename,
      }),
    ),
  );
}

/** Drop local paths; keep HTTPS URLs for listing image fields. */
export function filterListingImageUrls(urls: string[]): string[] {
  return urls
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .filter((u) => {
      if (u.startsWith("/") || u.startsWith("file:")) return false;
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== "https:") return env.NODE_ENV !== "production";
        return true;
      } catch {
        return false;
      }
    });
}

export { MAX_FILES_PER_REQUEST };
