import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createPresignedImageUpload,
  createPresignedImageUploads,
  isMediaStorageConfigured,
  MediaConfigError,
  MediaValidationError,
  MAX_FILES_PER_REQUEST,
} from "../lib/media.js";

const router = Router();

const fileSchema = z.object({
  contentType: z.string().min(1),
  filename: z.string().max(255).optional(),
});

const presignSchema = z.union([
  z.object({
    contentType: z.string().min(1),
    filename: z.string().max(255).optional(),
  }),
  z.object({
    files: z.array(fileSchema).min(1).max(MAX_FILES_PER_REQUEST),
  }),
]);

router.get("/status", (_req, res) => {
  res.json({
    configured: isMediaStorageConfigured(),
    maxFilesPerRequest: MAX_FILES_PER_REQUEST,
    allowedContentTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ],
  });
});

router.post("/presign", requireAuth, async (req, res) => {
  if (!isMediaStorageConfigured()) {
    return res.status(503).json({
      error: "media_not_configured",
      message:
        "S3 media is not configured. Set AWS_REGION, S3_MEDIA_BUCKET, and IAM credentials on the API service.",
    });
  }

  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.user!.sub;

  try {
    if ("files" in parsed.data) {
      const files = await createPresignedImageUploads(userId, parsed.data.files);
      return res.json({ files });
    }

    const upload = await createPresignedImageUpload({
      userId,
      contentType: parsed.data.contentType,
      filename: parsed.data.filename,
    });
    return res.json(upload);
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    if (err instanceof MediaConfigError) {
      return res.status(503).json({ error: err.code, message: err.message });
    }
    console.error("[media] presign failed:", err);
    return res.status(500).json({ error: "internal", message: "Failed to create upload URL" });
  }
});

export default router;
